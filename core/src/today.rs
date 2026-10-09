// The Today page: what needs me now. The core works out which items count, the groups and their order, the people
// rows and their flags, and the counts; the page only draws them. Today reads the Board the core builds (crate::board)
// and changes the ledger only through the Board's own operations, so actions/ledger.json stays the one place a change
// is recorded. Nothing here is shown that the summaries and the ledger don't state.
use std::cmp::Ordering;

use serde_json::{json, Map, Value};

use crate::board::{self, Board, Card};
use crate::briefing::{self, Week};
use crate::meetings::{days_between, overview, summary_files, today_iso, Meeting};
use crate::people::{People, Person, FILE as PEOPLE_FILE};
use crate::paths::Workspace;
use crate::{agents, js, ledger, notes, Error};

/// The chips that put an item under I owe, Owed to me or Open items, in the order those groups list them.
const DUE_RULES: [&str; 3] = ["past-due", "due-soon", "open-long"];
/// The chips that ask me to confirm what a summary reports.
const CONFIRM_RULES: [&str; 2] = ["reported", "still-mentioned"];
/// "No 1:1 in N days" when a report's last meeting with me is more than this many days ago.
const NO_MEETING_DAYS: i64 = 30;
/// "Busy week" when this many of a report's open items are past due or due within the next 7 days.
const BUSY_ITEMS: usize = 3;
const BUSY_DAYS: i64 = 7;

/// One item that counts on Today and the People pages: an action item or a card of my own, never a suggestion I have
/// not accepted.
pub(crate) struct Item<'a> {
    pub card: &'a Card,
    /// The owner's Name from people.md, or the owner as written.
    pub owner: Option<String>,
    pub mine: bool,
    pub rule: &'a str,
    /// The day it was first seen: its first meeting, or the day a card of my own was made.
    pub since: Option<&'a str>,
}

impl Item<'_> {
    fn due(&self) -> Option<&str> {
        self.card.json["dueDate"].as_str()
    }

    pub fn open(&self) -> bool {
        self.card.column != "done"
    }

    fn report_date(&self) -> Option<&str> {
        self.card.json["reported"]["date"].as_str().or(self.card.json["stillMentioned"].as_str())
    }
}

/// Who "me" is in people.md, or why that can't be told.
pub(crate) fn who_is_me(people: &People) -> (Option<String>, Value) {
    let mes: Vec<&str> = people.people.iter().filter(|p| p.relationship.eq_ignore_ascii_case("me")).map(|p| p.name.as_str()).collect();
    let problem = |reason: &str, count: usize| json!({ "reason": reason, "file": PEOPLE_FILE, "count": count });
    if !people.found { return (None, problem("no-file", 0)); }
    match mes.as_slice() {
        [me] => (Some(me.to_string()), Value::Null),
        [] => (None, problem("no-me", 0)),
        _ => (None, problem("several", mes.len())),
    }
}

pub(crate) fn items<'a>(b: &'a Board, people: &People, me: Option<&str>) -> Vec<Item<'a>> {
    b.cards.iter().filter(|c| c.json["suggested"] != true).map(|card| {
        let written = card.json["owner"].as_str().filter(|o| !js::trim(o).is_empty());
        // An action item's owner is already the Name; a card of my own has its owner as I typed it.
        let owner = written.map(|o| people.resolve(o).unwrap_or(o).to_string());
        // A card of my own with no owner is mine.
        let mine = me.is_some_and(|m| owner.as_deref() == Some(m) || (card.own && owner.is_none()));
        let since = if card.own {
            card.json["created"].as_str().and_then(|c| c.get(..10))
        } else {
            card.json["meetingDate"].as_str()
        };
        Item { card, owner, mine, rule: card.json["chip"]["rule"].as_str().unwrap_or(""), since }
    }).collect()
}

/// Past due first (most overdue at the top), then due soon (soonest first), then open a long time (oldest first).
/// Equal dates go by ID.
fn due_order(a: &Item, b: &Item) -> Ordering {
    let rank = |i: &Item| DUE_RULES.iter().position(|r| *r == i.rule);
    rank(a).cmp(&rank(b))
        .then_with(|| if a.rule == "open-long" { a.since.cmp(&b.since) } else { a.due().cmp(&b.due()) })
        .then_with(|| js::locale_compare(&a.card.id, &b.card.id, true))
}

/// The oldest report first.
fn confirm_order(a: &Item, b: &Item) -> Ordering {
    a.report_date().cmp(&b.report_date()).then_with(|| js::locale_compare(&a.card.id, &b.card.id, true))
}

/// The order on a person's page: items with a due date first, the soonest at the top, then those without, the oldest
/// first. Equal ones go by ID.
pub(crate) fn person_order(a: &Item, b: &Item) -> Ordering {
    a.due().is_none().cmp(&b.due().is_none())
        .then_with(|| a.due().cmp(&b.due()))
        .then_with(|| a.since.cmp(&b.since))
        .then_with(|| js::locale_compare(&a.card.id, &b.card.id, true))
}

/// What the page draws for an item: its card, its owner's Name, whether it is mine, and for a report, what the
/// summary said word for word and which meeting said it.
pub(crate) fn item_json(b: &Board, it: &Item) -> Value {
    let mut out = it.card.json.clone();
    out["owner"] = json!(it.owner);
    out["mine"] = json!(it.mine);
    // The report is always the item's latest mention: Reported done or dropped is what the last summary says, and
    // Still mentioned is the last summary after the close.
    let row = (!it.card.own).then(|| b.ov.rows.iter().find(|r| r.usable && r.json["id"] == it.card.id.as_str())).flatten();
    out["report"] = match (it.report_date(), row) {
        (Some(date), Some(row)) => {
            let latest = row.json["sources"].as_array().and_then(|s| s.last());
            json!({
                "date": date,
                "file": latest.map_or(Value::Null, |l| l["file"].clone()),
                "status": row.json["latestStatus"], "statusHtml": row.json["latestStatusHtml"],
            })
        }
        _ => Value::Null,
    };
    out
}

/// Whether `name` is among a meeting's attendees, written as the Name or an "Also called" name.
pub(crate) fn attended(m: &Meeting, people: &People, name: &str) -> bool {
    m.people.iter().flatten().any(|a| people.resolve(a).unwrap_or(a) == name)
}

/// What Today and the People pages say about one person, worked out the same way for both: the last meeting with me,
/// their open items, my open items from meetings they attended, and for a report the flags. Nothing here rates or
/// ranks anyone.
pub(crate) struct Facts<'b, 'i> {
    pub last: Option<&'b Meeting>,
    pub days_since: Option<i64>,
    /// Their open items: "Owes you".
    pub theirs: Vec<&'i Item<'b>>,
    /// My open items from a meeting they attended: "You owe".
    pub yours: Vec<&'i Item<'b>>,
    pub flags: Vec<Value>,
}

pub(crate) fn facts<'b, 'i>(b: &'b Board, people: &People, me: &str, all: &'i [Item<'b>], p: &Person) -> Facts<'b, 'i> {
    let as_of = b.ov.as_of.as_str();
    let name = p.name.as_str();
    // The meetings are newest first.
    let last = b.ov.meetings.iter()
        .filter(|m| m.date.as_deref().is_some_and(|d| d <= as_of))
        .find(|m| attended(m, people, name) && attended(m, people, me));
    let days_since = last.and_then(|m| days_between(m.date.as_deref()?, as_of));
    let open = || all.iter().filter(|i| i.open());
    let theirs: Vec<&Item> = open().filter(|i| i.owner.as_deref() == Some(name)).collect();
    let yours: Vec<&Item> = open().filter(|i| i.mine).filter(|i| {
        let file = i.card.json["meeting"].as_str();
        b.ov.meetings.iter().any(|m| Some(m.file.as_str()) == file && attended(m, people, name))
    }).collect();
    // The flags are for reports only.
    let mut flags = Vec::new();
    if p.relationship.eq_ignore_ascii_case("report") {
        let busy = theirs.iter().filter(|i| i.due().and_then(|d| days_between(as_of, d)).is_some_and(|n| n <= BUSY_DAYS)).count();
        match days_since {
            None => flags.push(json!({ "rule": "no-meeting-yet", "text": "No 1:1 yet" })),
            Some(n) if n > NO_MEETING_DAYS => flags.push(json!({ "rule": "no-meeting", "text": format!("No 1:1 in {n} days") })),
            _ => {}
        }
        if busy >= BUSY_ITEMS { flags.push(json!({ "rule": "busy-week", "text": "Busy week" })); }
    }
    Facts { last, days_since, theirs, yours, flags }
}

/// A person's row, as Today and the People list draw it. "notesSince" counts my notes about them dated after the last
/// meeting with me (all of them when there has been none); null when notes/notes.json can't be read. No note text.
pub(crate) fn person_json(p: &Person, f: &Facts, people: &People, notes: &notes::Notes) -> Value {
    let since = notes.error.is_none().then(|| notes::count_since(&notes.list, people, &p.name, f.last.and_then(|m| m.date.as_deref())));
    json!({
        "name": p.name, "role": p.role, "relationship": p.relationship,
        "lastMeeting": f.last.map(|m| json!({ "date": m.date, "file": m.file })),
        "daysSince": f.days_since,
        "owesYou": f.theirs.len(), "youOwe": f.yours.len(),
        "flags": f.flags,
        "notesSince": since,
    })
}

/// One row for each report, in people.md order.
fn people_rows(b: &Board, people: &People, me: &str, items: &[Item], notes: &notes::Notes) -> Value {
    let mut flag_count = 0;
    let reports: Vec<Value> = people.people.iter().filter(|p| p.relationship.eq_ignore_ascii_case("report")).map(|p| {
        let f = facts(b, people, me, items, p);
        flag_count += f.flags.len();
        person_json(p, &f, people, notes)
    }).collect();
    json!({ "reports": reports, "flagCount": flag_count })
}

/// The foot: how many things could not be read (the Meetings page's count) and how many agents have a review due
/// (the Agents page's count; none when the agents can't be read).
fn foot(ws: &Workspace, could_not_read: usize) -> Value {
    let review_due = agents::load_agents(ws).ok().map(|a| a["cards"].as_array().map_or(0, |c| c.iter().filter(|c| c["reviewDue"] == true).count()));
    json!({ "couldNotRead": could_not_read, "agentsReviewDue": review_due })
}

fn counts(i_owe: usize, owed: usize, open: usize, confirm: usize) -> Value {
    json!({ "iOwe": i_owe, "owedToMe": owed, "open": open, "confirm": confirm, "total": i_owe + owed + open + confirm })
}

/// A Today with nothing to list: no summaries yet, or a ledger that can't be read.
fn empty(status: &str, as_of: String, as_of_is_newest: bool, ledger_error: Option<String>, foot: Value) -> Value {
    json!({
        "status": status, "asOf": as_of, "asOfIsNewestMeeting": as_of_is_newest, "ledgerError": ledger_error,
        "me": null, "meProblem": null, "groups": [], "counts": counts(0, 0, 0, 0), "people": null, "foot": foot, "meetings": [],
        "briefing": null,
    })
}

/// The briefing for `week` from the Board as it is. Without a readable ledger nothing can be told about what is closed,
/// so there is none.
fn briefing_of(ws: &Workspace, b: &Board, week: Week) -> Result<Value, Error> {
    let people = &b.ov.people;
    let (me, _) = who_is_me(people);
    let all = items(b, people, me.as_deref());
    let confirm = all.iter().filter(|i| CONFIRM_RULES.contains(&i.rule)).count();
    briefing::build(ws, b, people, me.as_deref(), &all, confirm, week)
}

fn view(ws: &Workspace, demo: bool, acted: Option<&str>, week: Week) -> Result<Value, Error> {
    if summary_files(ws)?.is_empty() {
        let mut out = empty("no-summaries", today_iso(), false, None, Value::Null);
        out["briefing"] = match ledger::load(ws)? {
            ledger::Loaded::Unreadable(_) => Value::Null,
            _ => briefing_of(ws, &board::build(ws, demo)?, week)?,
        };
        return Ok(out);
    }
    if let ledger::Loaded::Unreadable(why) = ledger::load(ws)? {
        // The Meetings page counts the ledger among the things it could not read, and so does the foot.
        let ov = overview(ws, demo)?;
        return Ok(empty("ledger-unreadable", ov.as_of, ov.as_of_is_newest_meeting, Some(ledger::unreadable_message(&why)), foot(ws, ov.warnings.len() + 1)));
    }
    let b = board::build(ws, demo)?;
    let people = &b.ov.people;
    let (me, me_problem) = who_is_me(people);
    let all = items(&b, people, me.as_deref());

    let pick = |keep: &dyn Fn(&Item) -> bool, order: fn(&Item, &Item) -> Ordering| -> Vec<&Item> {
        let mut list: Vec<&Item> = all.iter().filter(|i| keep(i)).collect();
        list.sort_by(|a, b| order(a, b));
        list
    };
    let due = |i: &Item| i.open() && DUE_RULES.contains(&i.rule);
    let confirm = pick(&|i| CONFIRM_RULES.contains(&i.rule), confirm_order);
    let group = |key: &str, list: &[&Item]| json!({ "key": key, "items": list.iter().map(|i| item_json(&b, i)).collect::<Vec<_>>() });
    let (groups, counts, people_view) = match &me {
        Some(me) => {
            let i_owe = pick(&|i| due(i) && i.mine, due_order);
            let owed = pick(&|i| due(i) && !i.mine, due_order);
            (
                vec![group("i-owe", &i_owe), group("owed-to-me", &owed), group("confirm", &confirm)],
                counts(i_owe.len(), owed.len(), 0, confirm.len()),
                people_rows(&b, people, me, &all, &notes::read_all(ws)?),
            )
        }
        // Without one "me" in people.md, whose an item is can't be told: one group for every owner.
        None => {
            let open = pick(&|i| due(i), due_order);
            (vec![group("open", &open), group("confirm", &confirm)], counts(0, 0, open.len(), confirm.len()), Value::Null)
        }
    };

    let mut out = Map::new();
    out.insert("status".into(), json!("ok"));
    out.insert("asOf".into(), json!(b.ov.as_of));
    out.insert("asOfIsNewestMeeting".into(), json!(b.ov.as_of_is_newest_meeting));
    out.insert("ledgerError".into(), Value::Null);
    out.insert("me".into(), json!(me));
    out.insert("meProblem".into(), me_problem);
    out.insert("groups".into(), json!(groups));
    out.insert("counts".into(), counts);
    out.insert("people".into(), people_view);
    out.insert("foot".into(), foot(ws, b.ov.warnings.len()));
    out.insert("meetings".into(), json!(b.ov.meetings.iter().map(|m| json!({ "file": m.file, "date": m.date, "title": m.title })).collect::<Vec<_>>()));
    out.insert("briefing".into(), briefing::build(ws, &b, people, me.as_deref(), &all, confirm.len(), week)?);
    // After an action: the item as it is now, wherever it is listed, so the page can update its row in place.
    if let Some(id) = acted {
        let item = all.iter().find(|i| i.card.id == id).map(|i| item_json(&b, i));
        out.insert("item".into(), item.unwrap_or(Value::Null));
    }
    Ok(Value::Object(out))
}

/// Today, with the briefing for `week`.
pub fn today_view(ws: &Workspace, demo: bool, week: Week) -> Result<Value, Error> {
    view(ws, demo, None, week)
}

/// The actions on a row: close, reopen, keep (Keep open and Keep closed) and due ({ due }, my due date). Each is one
/// of the Board's own changes; the answer is the new Today, with the briefing for `week`, and the item as it is now.
pub fn act(ws: &Workspace, demo: bool, id: &str, action: &str, input: &Map<String, Value>, week: Week) -> Result<Value, Error> {
    apply(ws, demo, id, action, input)?;
    view(ws, demo, Some(id), week)
}

/// One action on an item, as Today and a person's page send it.
pub(crate) fn apply(ws: &Workspace, demo: bool, id: &str, action: &str, input: &Map<String, Value>) -> Result<(), Error> {
    match action {
        "close" => board::move_to_top(ws, demo, id, "done")?,
        "reopen" => board::move_to_top(ws, demo, id, "todo")?,
        "keep" => board::keep_card(ws, demo, id)?,
        "due" => {
            let due = input.get("due").ok_or_else(|| Error::Status(400, "Send the due date as { \"due\": \"YYYY-MM-DD\" }, or null to clear it".into()))?;
            board::edit_card(ws, demo, id, &Map::from_iter([("due".to_string(), due.clone())]))?;
        }
        _ => return Err(Error::Status(404, "Not found".into())),
    }
    Ok(())
}
