// The People page: one row for each person in people.md, a page for each of them, and the names the summaries use
// that people.md does not have. The counts and flags are Today's, worked out by the same code (crate::today), and the
// actions on a person's page are Today's (crate::today::apply), so actions/ledger.json stays the one place a change is
// recorded. My notes between meetings come from crate::notes, with their text only when private notes are asked for.
// people.md is only read. Nothing here scores, rates or ranks anyone.
use serde_json::{json, Map, Value};

use crate::board::{self, Board};
use crate::meetings::{overview, owner_names, Overview};
use crate::people::{People, Person, COLUMNS, FILE as PEOPLE_FILE};
use crate::paths::Workspace;
use crate::today::{self, Item};
use crate::{js, ledger, notes, Error};

/// The headings on the list, in order, by relationship. A relationship that is none of these is listed under Others.
const GROUPS: [(&str, &str); 4] = [("report", "Reports"), ("manager", "Manager"), ("peer", "Peers"), ("other", "Others")];

fn is_me(p: &Person) -> bool {
    p.relationship.eq_ignore_ascii_case("me")
}

fn group_of(p: &Person) -> &'static str {
    let r = p.relationship.to_lowercase();
    GROUPS.iter().find(|(k, _)| *k == r).map_or("other", |(k, _)| k)
}

/// The Board when the ledger can be read; otherwise the summaries alone, with what the Board and Today say about the
/// ledger. Without the Board nothing is counted.
enum Source {
    Board(Board),
    NoLedger(Overview, String),
}

impl Source {
    fn load(ws: &Workspace, demo: bool) -> Result<Self, Error> {
        if let ledger::Loaded::Unreadable(why) = ledger::load(ws)? {
            return Ok(Source::NoLedger(overview(ws, demo)?, ledger::unreadable_message(&why)));
        }
        Ok(Source::Board(board::build(ws, demo)?))
    }

    fn ov(&self) -> &Overview {
        match self {
            Source::Board(b) => &b.ov,
            Source::NoLedger(ov, _) => ov,
        }
    }

    fn ledger_error(&self) -> Option<&str> {
        match self {
            Source::Board(_) => None,
            Source::NoLedger(_, why) => Some(why),
        }
    }
}

/// Names on Attendees lines, and owners of action items, that people.md does not have: each as written, once,
/// sorted. A row from "Open Items from Earlier Meetings" adds none: with an ID it repeats an action item's owner,
/// and without one it is background, not an action item.
fn not_in_people(ov: &Overview) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for m in &ov.meetings {
        let owners = m.action_items.iter().flat_map(|a| owner_names(&a.owner));
        for n in m.people.iter().flatten().cloned().chain(owners) {
            if ov.people.resolve(&n).is_none() && !names.contains(&n) { names.push(n); }
        }
    }
    names.sort_by(|a, b| js::cmp_utf16(a, b));
    names
}

/// The parts both pages share: the as-of date, who "me" is, and the ledger's state.
fn head(src: &Source) -> (Map<String, Value>, Option<String>) {
    let ov = src.ov();
    let (me, me_problem) = today::who_is_me(&ov.people);
    let mut out = Map::new();
    out.insert("status".into(), json!(if src.ledger_error().is_some() { "ledger-unreadable" } else { "ok" }));
    out.insert("ledgerError".into(), json!(src.ledger_error()));
    out.insert("asOf".into(), json!(ov.as_of));
    out.insert("asOfIsNewestMeeting".into(), json!(ov.as_of_is_newest_meeting));
    out.insert("me".into(), json!(me));
    out.insert("meProblem".into(), me_problem);
    (out, me)
}

/// A person with nothing counted: when the ledger can't be read, or people.md has no single "me".
fn bare_json(p: &Person) -> Value {
    json!({
        "name": p.name, "role": p.role, "relationship": p.relationship,
        "lastMeeting": null, "daysSince": null, "owesYou": null, "youOwe": null, "flags": [], "notesSince": null,
    })
}

/// GET /api/people: people.md as read (file, fileFound, people, warnings, as before), the list the page draws, and my
/// notes about anyone people.md does not have (their text only when `show_private`).
pub fn list_view(ws: &Workspace, demo: bool, show_private: bool) -> Result<Value, Error> {
    let src = Source::load(ws, demo)?;
    let ov = src.ov();
    let people: &People = &ov.people;
    let notes = notes::read_all(ws)?;
    let (mut out, me) = head(&src);
    let counted = match (&src, &me) {
        (Source::Board(b), Some(me)) => Some((b, me.as_str(), today::items(b, people, Some(me)))),
        _ => None,
    };
    let row = |p: &Person| match &counted {
        Some((b, me, all)) => today::person_json(p, &today::facts(b, people, me, all, p), people, &notes),
        None => bare_json(p),
    };
    let you = match people.people.iter().filter(|p| is_me(p)).collect::<Vec<_>>().as_slice() {
        [p] => json!({ "name": p.name, "role": p.role }),
        _ => Value::Null,
    };
    let groups: Vec<Value> = GROUPS.iter().filter_map(|(key, heading)| {
        let rows: Vec<Value> = people.people.iter().filter(|p| !is_me(p) && group_of(p) == *key).map(row).collect();
        (!rows.is_empty()).then(|| json!({ "key": key, "heading": heading, "people": rows }))
    }).collect();
    out.insert("file".into(), json!(PEOPLE_FILE));
    out.insert("fileFound".into(), json!(people.found));
    out.insert("columns".into(), json!(COLUMNS));
    out.insert("people".into(), json!(people.people.iter().map(|x| json!({ "name": x.name, "role": x.role, "relationship": x.relationship, "alsoCalled": x.also_called })).collect::<Vec<_>>()));
    out.insert("warnings".into(), json!(people.warnings));
    out.insert("you".into(), you);
    out.insert("groups".into(), json!(groups));
    out.insert("notInPeople".into(), json!(not_in_people(ov)));
    out.insert("notesError".into(), json!(notes.error));
    out.insert("notesNotInPeople".into(), notes::not_in_people(&notes, ov, show_private));
    Ok(Value::Object(out))
}

/// The person a name in the address stands for: a Name or an "Also called" name in people.md, never "me".
fn find<'a>(people: &'a People, name: &str) -> Result<&'a Person, Error> {
    let message = if !people.found {
        format!("There is no {PEOPLE_FILE} in this workspace, so there is no page for \"{name}\".")
    } else {
        format!("There is no one named \"{name}\" in {PEOPLE_FILE}.")
    };
    people.resolve(name)
        .and_then(|n| people.people.iter().find(|p| p.name == n))
        .filter(|p| !is_me(p))
        .ok_or_else(|| Error::NoPerson(name.to_string(), message))
}

fn view(ws: &Workspace, demo: bool, name: &str, acted: Option<&str>, show_private: bool) -> Result<Value, Error> {
    let src = Source::load(ws, demo)?;
    let ov = src.ov();
    let people = &ov.people;
    let p = find(people, name)?;
    let notes = notes::read_all(ws)?;
    let (mut out, me) = head(&src);
    let attended: Vec<Value> = ov.meetings.iter().filter(|m| today::attended(m, people, &p.name))
        .map(|m| json!({ "file": m.file, "date": m.date, "title": m.title, "type": m.kind })).collect();
    let all = match (&src, &me) { (Source::Board(b), Some(me)) => today::items(b, people, Some(me)), _ => Vec::new() };
    let board = match (&src, &me) { (Source::Board(b), Some(me)) => Some((b, all.as_slice(), me.as_str())), _ => None };
    out.insert("notes".into(), notes::person_block(&notes, ov, board, p, show_private));
    let mut person = match board {
        Some((b, all, me)) => {
            let f = today::facts(b, people, me, all, p);
            let list = |items: &[&Item]| {
                let mut items = items.to_vec();
                items.sort_by(|a, b| today::person_order(a, b));
                json!(items.iter().map(|i| today::item_json(b, i)).collect::<Vec<_>>())
            };
            out.insert("theyOwe".into(), list(&f.theirs));
            out.insert("youOwe".into(), list(&f.yours));
            // After an action: the item as it is now, so the page can update its row in place.
            if let Some(id) = acted {
                out.insert("item".into(), all.iter().find(|i| i.card.id == id).map_or(Value::Null, |i| today::item_json(b, i)));
            }
            today::person_json(p, &f, people, &notes)
        }
        _ => {
            out.insert("theyOwe".into(), Value::Null);
            out.insert("youOwe".into(), Value::Null);
            bare_json(p)
        }
    };
    person["alsoCalled"] = json!(p.also_called);
    out.insert("person".into(), person);
    out.insert("attended".into(), json!(attended));
    // Every meeting, for naming the one an item came from.
    out.insert("meetings".into(), json!(ov.meetings.iter().map(|m| json!({ "file": m.file, "date": m.date, "title": m.title })).collect::<Vec<_>>()));
    Ok(Value::Object(out))
}

/// GET /api/people/<name>: one person's page, with my notes about them (their text only when `show_private`).
pub fn person_view(ws: &Workspace, demo: bool, name: &str, show_private: bool) -> Result<Value, Error> {
    view(ws, demo, name, None, show_private)
}

/// POST /api/people/<name>/items/<id>/<action>: close, reopen or due ({ due }), each one of the Board's own changes, as
/// Today makes them. The answer is the person's page with the item as it is now.
pub fn act(ws: &Workspace, demo: bool, name: &str, id: &str, action: &str, input: &Map<String, Value>, show_private: bool) -> Result<Value, Error> {
    find(&crate::people::load_people(ws)?, name)?;
    today::apply(ws, demo, id, action, input)?;
    view(ws, demo, name, Some(id), show_private)
}
