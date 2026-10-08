// The Board: every action item with a usable ID, and my own cards, in three columns. There is no import: an item
// is on the Board because it is in a summary, and sits in To do until I change it. What I do with a card is
// recorded in actions/ledger.json (crate::ledger); what the summaries report never moves a card, it shows as a
// tag. board/board.json from an earlier version is never read or written.
use std::collections::HashMap;

use serde_json::{json, Map, Value};

use crate::ledger::{self, COLUMNS};
use crate::meetings::{days_between, overview, Meeting, Overview, TrackedRow};
use crate::paths::Workspace;
use crate::{js, notes, Error};

const OLD_FILE: &str = "board/board.json";
const MAX_TITLE: usize = 500;
const MAX_OWNER: usize = 120;
const MAX_NOTE: usize = 2000;

fn columns() -> Value {
    json!([{ "id": "todo", "name": "To do" }, { "id": "doing", "name": "Doing" }, { "id": "done", "name": "Done" }])
}

fn err(status: u16, message: impl Into<String>) -> Error {
    Error::Status(status, message.into())
}

pub(crate) struct Card {
    pub id: String,
    pub own: bool,
    /// A suggested item, accepted or not.
    was_suggested: bool,
    pub column: String,
    /// The place in To do when the ledger gives none: oldest first, then my own cards.
    rank: usize,
    pub json: Value,
}

/// The Board as the core works it out; the Today page reads the same one.
pub(crate) struct Board {
    pub ov: Overview,
    ledger: Value,
    /// In display order: column by column, each in its saved order, then the rest by rank.
    pub cards: Vec<Card>,
}

impl Board {
    fn card(&self, id: &str) -> Result<&Card, Error> {
        self.cards.iter().find(|c| c.id == id).ok_or_else(|| err(404, "That card is no longer on the Board. Reload to see the current Board."))
    }

    fn column_ids(&self, col: &str, without: &str) -> Vec<String> {
        self.cards.iter().filter(|c| c.column == col && c.id != without).map(|c| c.id.clone()).collect()
    }
}

/// What the summaries report, shown beside a card that the report doesn't agree with. Never moves it. A report
/// dated on or before `seen` (Keep open, Keep closed) is not shown; a later summary that reports it again is.
fn report_tags(mentions: &[(String, &'static str)], column: &str, closed: Option<&str>, seen: Option<&str>) -> (Value, Value) {
    let Some((date, state)) = mentions.last() else { return (Value::Null, Value::Null) };
    let unseen = |d: &str| seen.is_none_or(|s| d > s);
    if column != "done" {
        let reported = (*state != "open" && unseen(date)).then(|| json!({ "state": state, "date": date }));
        return (json!(reported), Value::Null);
    }
    // In Done: the latest summary dated after the close still reports it open.
    let still = closed.and_then(|c| mentions.iter().rfind(|(d, _)| d.as_str() > c)).filter(|(d, s)| *s == "open" && unseen(d)).map(|(d, _)| d.clone());
    (Value::Null, json!(still))
}

// ---------- the chip ----------

/// A chip's day, "Sep 22"; with the year when it is not the as-of date's year, "Jan 5, 2027".
fn chip_date(d: &str, as_of: &str) -> String {
    const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if !js::is_real_date(d) { return d.to_string(); }
    let month = MONTHS[d[5..7].parse::<usize>().unwrap() - 1];
    let day = d[8..10].parse::<u32>().unwrap();
    if d[..4] == as_of[..4.min(as_of.len())] { format!("{month} {day}") } else { format!("{month} {day}, {}", &d[..4]) }
}

fn days(n: i64) -> String {
    if n == 1 { "1 day".into() } else { format!("{n} days") }
}

/// The one chip a card shows, decided here so the Board and the Meetings page draw the same one. A suggestion I
/// have not accepted shows "Suggested". Otherwise the first rule that matches wins:
///   a. in Done, a summary dated after the close still reports it open: "Still mentioned <date>" (late)
///   b. a summary reports it done or dropped: "Reported done <date>" or "Reported dropped <date>" (soon)
///   c. in Done: "Closed <date>" (neutral)
///   d. the due date is before the as-of date: "Past due N days" (late)
///   e. due within the next 7 days: "Due today" or "Due in N days" (soon)
///   f. no due date, and first seen more than 30 days ago: "Open N days" (neutral)
///   g. otherwise "Due <date>" or "No due date" (neutral)
/// The due date is mine if I set one, otherwise the summary's. My own cards count their age from when they
/// were created; a and b never apply to them.
fn chip(card: &Value, first_seen: Option<&str>, as_of: &str) -> Value {
    let make = |rule: &str, tone: &str, text: String| json!({ "rule": rule, "tone": tone, "text": text });
    let date = |key: &str| card[key].as_str();
    if card["suggested"] == true { return make("suggested", "neutral", "Suggested".into()); }
    if let Some(d) = date("stillMentioned") { return make("still-mentioned", "late", format!("Still mentioned {}", chip_date(d, as_of))); }
    if let (Some(state), Some(d)) = (card["reported"]["state"].as_str(), card["reported"]["date"].as_str()) {
        return make("reported", "soon", format!("Reported {state} {}", chip_date(d, as_of)));
    }
    if card["column"] == "done" {
        let text = date("closed").map_or_else(|| "Closed".to_string(), |d| format!("Closed {}", chip_date(d, as_of)));
        return make("closed", "neutral", text);
    }
    match date("dueDate").and_then(|due| days_between(as_of, due).map(|n| (due, n))) {
        Some((_, n)) if n < 0 => make("past-due", "late", format!("Past due {}", days(-n))),
        Some((_, 0)) => make("due-soon", "soon", "Due today".into()),
        Some((_, n)) if n <= 7 => make("due-soon", "soon", format!("Due in {}", days(n))),
        Some((due, _)) => make("due", "neutral", format!("Due {}", chip_date(due, as_of))),
        None => match first_seen.and_then(|f| days_between(f, as_of)) {
            Some(age) if age > 30 => make("open-long", "neutral", format!("Open {age} days")),
            _ => make("due", "neutral", "No due date".into()),
        },
    }
}

/// An action item's card, from its row in the roll-up and its ledger entry. The Meetings page takes its chip
/// from here too.
pub fn item_card(row: &TrackedRow, entry: Option<&Value>, as_of: &str) -> Value {
    let r = &row.json;
    let column = ledger::column(entry).to_string();
    let closed = entry.and_then(ledger::closed_on);
    let my_due = ledger::text(entry, "due");
    let accepted = ledger::text(entry, "accepted");
    let suggested = r["suggested"] == true;
    let (reported, still) = report_tags(&row.mentions, &column, closed.as_deref(), ledger::text(entry, "reportSeen"));
    let first = &r["sources"][0];
    let mut card = json!({
        "id": r["id"], "own": false, "column": column,
        "title": r["text"], "owner": r["owner"], "meeting": first["file"], "meetingDate": first["date"],
        "summaryDue": r["due"], "summaryDueDate": r["dueDate"], "myDue": my_due,
        "dueDate": my_due.map(Value::from).unwrap_or_else(|| r["dueDate"].clone()),
        "closed": closed, "note": ledger::text(entry, "note"),
        "suggested": suggested && accepted.is_none(), "accepted": accepted,
        "reported": reported, "stillMentioned": still,
    });
    card["chip"] = chip(&card, r["firstSeen"].as_str(), as_of);
    card
}

fn own_card(id: &str, entry: &Value, as_of: &str) -> Value {
    let e = Some(entry);
    let my_due = ledger::text(e, "due");
    let created = entry.get("created").cloned().unwrap_or(Value::Null);
    let mut card = json!({
        "id": id, "own": true, "column": ledger::column(e),
        "title": entry["title"], "owner": ledger::text(e, "owner"), "meeting": ledger::text(e, "meeting"), "meetingDate": ledger::text(e, "meetingDate"),
        "summaryDue": null, "summaryDueDate": null, "myDue": my_due, "dueDate": my_due,
        "closed": ledger::closed_on(entry), "note": ledger::text(e, "note"),
        "suggested": false, "accepted": null, "reported": null, "stillMentioned": null,
        "created": created, "notes": null,
    });
    // Created is a time, "2026-09-20T09:00:00.000Z"; its day is when the card was first seen.
    let since = created.as_str().and_then(|c| c.get(..10)).filter(|d| js::is_real_date(d));
    card["chip"] = chip(&card, since, as_of);
    card
}

pub(crate) fn build(ws: &Workspace, demo: bool) -> Result<Board, Error> {
    let ov = overview(ws, demo)?;
    let ledger = ledger::read(ws)?;
    let entries = ledger::items(&ledger);
    // An action item that notes name shows how many, and whose; never their text. None when notes.json can't be read.
    let markers = notes::markers(&notes::read_all(ws)?.list, &ov.people);
    let mut cards = Vec::new();
    for row in ov.rows.iter().filter(|r| r.usable) {
        let id = row.json["id"].as_str().unwrap().to_string();
        let mut json = item_card(row, entries.get(&id), &ov.as_of);
        json["notes"] = markers.get(&id).cloned().unwrap_or(Value::Null);
        let column = json["column"].as_str().unwrap().to_string();
        cards.push(Card { id, own: false, was_suggested: row.json["suggested"] == true, column, rank: cards.len(), json });
    }
    for (id, entry) in entries.iter().filter(|(id, _)| id.starts_with("C-")) {
        let json = own_card(id, entry, &ov.as_of);
        let column = json["column"].as_str().unwrap().to_string();
        cards.push(Card { id: id.clone(), own: true, was_suggested: false, column, rank: cards.len(), json });
    }
    // Saved order first, the rest by rank.
    let mut sorted = Vec::new();
    for col in COLUMNS {
        let saved: HashMap<String, usize> = ledger::order(&ledger, col).into_iter().enumerate().map(|(i, id)| (id, i)).collect();
        let mut in_col: Vec<Card> = Vec::new();
        let mut rest = Vec::new();
        for c in cards.drain(..) { if c.column == col { in_col.push(c) } else { rest.push(c) } }
        cards = rest;
        in_col.sort_by_key(|c| saved.get(&c.id).map_or((1, c.rank), |&i| (0, i)));
        sorted.extend(in_col);
    }
    Ok(Board { ov, ledger, cards: sorted })
}

/// Why a ledger entry has no card on the Board.
fn not_on_board(b: &Board) -> Vec<Value> {
    let mut uses: HashMap<&str, usize> = HashMap::new();
    for r in b.ov.rows.iter().filter(|r| r.json["kind"] == "action item") {
        if let Some(id) = r.json["id"].as_str() { *uses.entry(id).or_default() += 1; }
    }
    ledger::items(&b.ledger).iter()
        .filter(|(id, _)| !id.starts_with("C-") && !b.cards.iter().any(|c| &c.id == *id))
        .map(|(id, entry)| {
            let reason = match uses.get(id.as_str()) {
                Some(n) if *n > 1 => "its ID is used twice in the summaries",
                Some(_) => "its ID is not in the form A-YYMMDD-n",
                None => "in no summary",
            };
            let e = Some(entry);
            json!({ "id": id, "reason": reason, "column": ledger::column(e), "closed": ledger::closed_on(entry), "note": ledger::text(e, "note") })
        })
        .collect()
}

fn view(ws: &Workspace, b: &Board, extra: Map<String, Value>) -> Result<Value, Error> {
    let item_rows = b.cards.iter().filter(|c| !c.own).map(|c| &c.json);
    let owners: Vec<String> = {
        let mut o: Vec<String> = Vec::new();
        for c in item_rows { if let Some(n) = c["owner"].as_str() { if !o.iter().any(|x| x == n) { o.push(n.to_string()); } } }
        o.sort_by(|a, b| js::cmp_utf16(a, b));
        o
    };
    let no_usable_id = b.ov.rows.iter().filter(|r| r.json["kind"] == "action item" && !r.usable).count();
    let old = ws.resolve(OLD_FILE)?.is_file();
    let mut out = Map::new();
    out.insert("asOf".into(), json!(b.ov.as_of));
    out.insert("asOfIsNewestMeeting".into(), json!(b.ov.as_of_is_newest_meeting));
    out.insert("columns".into(), columns());
    out.insert("cards".into(), json!(b.cards.iter().map(|c| c.json.clone()).collect::<Vec<_>>()));
    // The sidebar's count: cards not in Done, leaving out suggestions I have not accepted.
    out.insert("openCount".into(), json!(b.cards.iter().filter(|c| c.column != "done" && c.json["suggested"] != true).count()));
    out.insert("owners".into(), json!(owners));
    out.insert("noUsableId".into(), json!(no_usable_id));
    out.insert("notOnBoard".into(), json!(not_on_board(b)));
    out.insert("oldBoardFile".into(), if old { json!(OLD_FILE) } else { Value::Null });
    out.insert("meetings".into(), json!(b.ov.meetings.iter().map(|m| json!({ "file": m.file, "date": m.date, "title": m.title, "people": m.people })).collect::<Vec<_>>()));
    out.extend(extra);
    Ok(Value::Object(out))
}

pub fn board_view(ws: &Workspace, demo: bool) -> Result<Value, Error> {
    let b = build(ws, demo)?;
    view(ws, &b, Map::new())
}

/// Reads the Board, lets `f` change the ledger and saves it. Gives back the card `f` names, as it was before.
fn apply(ws: &Workspace, demo: bool, f: impl FnOnce(&Board, &mut Value) -> Result<Option<String>, Error>) -> Result<(Option<String>, Option<Value>), Error> {
    let b = build(ws, demo)?;
    let mut ledger = b.ledger.clone();
    let card_id = f(&b, &mut ledger)?;
    let card_before = card_id.as_deref().and_then(|id| b.cards.iter().find(|c| c.id == id)).map(|c| c.json.clone());
    if ledger != b.ledger { ledger::save(ws, &ledger)?; }
    Ok((card_id, card_before))
}

/// Reads the Board, lets `f` change the ledger, saves it, and answers with the new Board and the card `f` names.
fn change(ws: &Workspace, demo: bool, f: impl FnOnce(&Board, &mut Value) -> Result<Option<String>, Error>) -> Result<Value, Error> {
    let (card_id, card_before) = apply(ws, demo, f)?;
    let after = build(ws, demo)?;
    let card = card_id.as_deref().and_then(|id| after.cards.iter().find(|c| c.id == id)).map(|c| c.json.clone()).or(card_before);
    let mut extra = Map::new();
    extra.insert("card".into(), card.unwrap_or(Value::Null));
    view(ws, &after, extra)
}

fn entry<'a>(ledger: &'a mut Value, id: &str) -> &'a mut Map<String, Value> {
    ledger::items_mut(ledger).entry(id.to_string()).or_insert_with(|| json!({})).as_object_mut().unwrap()
}

fn not_a_suggestion_still(card: &Card) -> Result<(), Error> {
    if card.json["suggested"] == true { return Err(err(409, "Accept this suggested item first.")); }
    Ok(())
}

fn clean_text(value: Option<&Value>, name: &str, max: usize, required: bool) -> Result<String, Error> {
    static SPACE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| js::re(r"\s+", ""));
    let s = match value { Some(Value::String(s)) => js::trim(&SPACE.replace_all(s, " ")).to_string(), _ => String::new() };
    if required && s.is_empty() { return Err(err(400, format!("{name} is required"))); }
    if js::len(&s) > max { return Err(err(400, format!("{name} is longer than {max} characters"))); }
    Ok(s)
}

fn meeting_ref(file: Option<&Value>, meetings: &[Meeting]) -> Result<(Value, Value), Error> {
    if !js::truthy(file) { return Ok((Value::Null, Value::Null)); }
    match meetings.iter().find(|m| Some(m.file.as_str()) == file.and_then(Value::as_str)) {
        Some(m) => Ok((json!(m.file), json!(m.date))),
        None => Err(err(400, format!("Unknown meeting: {}", js::string(file)))),
    }
}

fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn null_if_empty(s: String) -> Value {
    if s.is_empty() { Value::Null } else { Value::String(s) }
}

/// The due date and note in a request, checked: Some(None) clears, None leaves as is.
struct Details {
    due: Option<Option<String>>,
    note: Option<Option<String>>,
}

fn details(input: &Map<String, Value>) -> Result<Details, Error> {
    let due = match input.get("due") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(Value::String(s)) if s.is_empty() => Some(None),
        Some(Value::String(s)) if js::is_real_date(s) => Some(Some(s.clone())),
        Some(_) => return Err(err(400, "The due date must be a real date written YYYY-MM-DD")),
    };
    let note = match input.get("note") {
        None => None,
        Some(Value::Null) => Some(None),
        Some(Value::String(s)) => {
            let t = js::trim(s);
            if js::len(t) > MAX_NOTE { return Err(err(400, format!("The note is longer than {MAX_NOTE} characters"))); }
            Some((!t.is_empty()).then(|| t.to_string()))
        }
        Some(_) => return Err(err(400, "The note must be text")),
    };
    Ok(Details { due, note })
}

fn apply_details(e: &mut Map<String, Value>, d: Details) {
    for (key, value) in [("due", d.due), ("note", d.note)] {
        match value {
            None => {}
            Some(None) => { e.shift_remove(key); }
            Some(Some(v)) => { e.insert(key.into(), json!(v)); }
        }
    }
}

/// Puts a card in a column: closing it with today's date when it goes into Done, reopening it when it leaves.
fn set_column(e: &mut Map<String, Value>, from: &str, to: &str, today: &str) {
    e.insert("column".into(), json!(to));
    if to == "done" && from != "done" { e.insert("closed".into(), json!(today)); }
    if to != "done" { e.shift_remove("closed"); }
}

// ---------- operations ----------

/// Moves a card to `column`, before the card `beforeId` (end of the column if none). Using a card id rather than
/// a position keeps drops right when the page is only showing some of the cards.
pub fn move_card(ws: &Workspace, demo: bool, id: &str, input: &Map<String, Value>) -> Result<Value, Error> {
    let to = match input.get("column").and_then(Value::as_str) {
        Some(c) if COLUMNS.contains(&c) => c.to_string(),
        _ => return Err(err(400, format!("Unknown column \"{}\"", js::string(input.get("column"))))),
    };
    let before_id = match input.get("beforeId") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) if s.is_empty() => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => return Err(err(400, "Invalid drop position")),
    };
    change(ws, demo, |b, ledger| {
        let card = b.card(id)?;
        not_a_suggestion_still(card)?;
        if before_id.as_deref() == Some(id) { return Ok(Some(id.to_string())); }
        let mut ids = b.column_ids(&to, id);
        let at = match &before_id {
            Some(before) => ids.iter().position(|x| x == before)
                .ok_or_else(|| err(409, "The drop position is no longer on the Board. Reload to see the current Board."))?,
            None => ids.len(),
        };
        ids.insert(at, id.to_string());
        set_column(entry(ledger, id), &card.column, &to, &b.ov.as_of);
        ledger::set_order(ledger, &to, ids);
        Ok(Some(id.to_string()))
    })
}

/// Changes any of { due, note }; for my own cards also { title, owner, meeting }. An action item's title, owner
/// and meeting come from the summary.
pub fn edit_card(ws: &Workspace, demo: bool, id: &str, input: &Map<String, Value>) -> Result<Value, Error> {
    change(ws, demo, |b, ledger| {
        let card = b.card(id)?;
        let own_fields = ["title", "owner", "meeting"].iter().any(|k| input.contains_key(*k));
        if !card.own && own_fields {
            return Err(err(403, "An action item’s title, owner and meeting come from the summary and can’t be edited here."));
        }
        not_a_suggestion_still(card)?;
        let d = details(input)?;
        let mut own = Map::new();
        if card.own {
            if input.contains_key("title") { own.insert("title".into(), json!(clean_text(input.get("title"), "Title", MAX_TITLE, true)?)); }
            if input.contains_key("owner") { own.insert("owner".into(), null_if_empty(clean_text(input.get("owner"), "Owner", MAX_OWNER, false)?)); }
            if input.contains_key("meeting") {
                let (meeting, date) = meeting_ref(input.get("meeting"), &b.ov.meetings)?;
                own.insert("meeting".into(), meeting);
                own.insert("meetingDate".into(), date);
            }
            if own_fields { own.insert("updated".into(), json!(now())); }
        }
        let e = entry(ledger, id);
        e.extend(own);
        apply_details(e, d);
        Ok(Some(id.to_string()))
    })
}

/// Accepts a suggested item: after that it is a card like any other.
pub fn accept_card(ws: &Workspace, demo: bool, id: &str) -> Result<Value, Error> {
    change(ws, demo, |b, ledger| {
        let card = b.card(id)?;
        if !card.was_suggested { return Err(err(409, "Only a suggested item can be accepted.")); }
        if card.json["accepted"].is_null() { entry(ledger, id).insert("accepted".into(), json!(b.ov.as_of)); }
        Ok(Some(id.to_string()))
    })
}

/// Adds a card of my own, with an ID that starts with C-, at the top of its column.
pub fn add_card(ws: &Workspace, demo: bool, input: &Map<String, Value>) -> Result<Value, Error> {
    change(ws, demo, |b, ledger| {
        let title = clean_text(input.get("title"), "Title", MAX_TITLE, true)?;
        let owner = clean_text(input.get("owner"), "Owner", MAX_OWNER, false)?;
        let (meeting, meeting_date) = meeting_ref(input.get("meeting"), &b.ov.meetings)?;
        let d = details(input)?;
        let col = match input.get("column").and_then(Value::as_str) { Some(c) if COLUMNS.contains(&c) => c, _ => "todo" };
        let id = loop {
            let id = format!("C-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
            if !ledger::items(ledger).contains_key(&id) { break id; }
        };
        let mut e = json!({
            "title": title, "owner": null_if_empty(owner), "meeting": meeting, "meetingDate": meeting_date, "created": now(),
        }).as_object().unwrap().clone();
        set_column(&mut e, "todo", col, &b.ov.as_of);
        apply_details(&mut e, d);
        ledger::items_mut(ledger).insert(id.clone(), Value::Object(e));
        let mut ids = b.column_ids(col, &id);
        ids.insert(0, id.clone());
        ledger::set_order(ledger, col, ids);
        Ok(Some(id))
    })
}

/// Deletes a card of my own. An action item stays on the Board as long as it is in a summary.
pub fn delete_card(ws: &Workspace, demo: bool, id: &str) -> Result<Value, Error> {
    change(ws, demo, |b, ledger| {
        let card = b.card(id)?;
        if !card.own { return Err(err(403, "Action items come from the summaries and stay on the Board. Close the card instead.")); }
        ledger::items_mut(ledger).shift_remove(id);
        ledger::drop_from_order(ledger, id);
        Ok(Some(id.to_string()))
    })
}

/// Close and Reopen from the Today page: the card goes to the top of Done, or the top of To do, as the Board's own
/// Close and Reopen buttons put it.
pub fn move_to_top(ws: &Workspace, demo: bool, id: &str, column: &str) -> Result<(), Error> {
    apply(ws, demo, |b, ledger| {
        let card = b.card(id)?;
        not_a_suggestion_still(card)?;
        let mut ids = b.column_ids(column, id);
        ids.insert(0, id.to_string());
        set_column(entry(ledger, id), &card.column, column, &b.ov.as_of);
        ledger::set_order(ledger, column, ids);
        Ok(Some(id.to_string()))
    }).map(|_| ())
}

/// Keep open (a summary reports it done or dropped) and Keep closed (a later summary still reports it open): records
/// the date of the report I have seen. Its chip goes away until a later summary reports it again; nothing else about
/// the card changes.
pub fn keep_card(ws: &Workspace, demo: bool, id: &str) -> Result<(), Error> {
    apply(ws, demo, |b, ledger| {
        let card = b.card(id)?;
        not_a_suggestion_still(card)?;
        let date = card.json["reported"]["date"].as_str().or(card.json["stillMentioned"].as_str())
            .ok_or_else(|| err(409, "No summary reports this item differently from your Board. Reload to see the current state."))?;
        entry(ledger, id).insert("reportSeen".into(), json!(date));
        Ok(Some(id.to_string()))
    }).map(|_| ())
}
