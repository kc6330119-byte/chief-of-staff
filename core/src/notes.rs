// notes/notes.json: short notes I write between meetings, after a conversation outside one. Each has a date, one person
// from people.md (never "me"), the text, and optionally the meeting or the action item it relates to. The app is the
// only writer: the file is created on the first note, never on a read, and is handled as plain JSON, so fields the app
// doesn't know are kept. A file that can't be read is never written over. A meeting summary is never touched.
//
// A note's text is private: it follows the "Show private notes" switch, as Manager-only notes do. Unless the caller
// asks for private notes, the text is in no answer from here. The markers and counts other pages show carry no text.
use std::collections::HashMap;
use std::fs;

use serde_json::{json, Map, Value};

use crate::board;
use crate::meetings::{overview, summary_files, Overview, COULD_NOT_READ};
use crate::people::{People, Person, FILE as PEOPLE_FILE};
use crate::paths::Workspace;
use crate::store::write_json_atomic;
use crate::today::{self, Item};
use crate::{js, ledger, Error};

pub const FILE: &str = "notes/notes.json";
const VERSION: u64 = 1;
const MAX_TEXT: usize = 2000;

fn err(status: u16, message: impl Into<String>) -> Error {
    Error::Status(status, message.into())
}

pub enum Loaded {
    Missing,
    Ok(Value),
    /// Why it could not be read. Nothing is written over it.
    Unreadable(String),
}

// Checks the whole file. If any part is off, the file is unreadable and nothing is written, so a hand-edited file is
// never overwritten with a guess.
fn validate(data: &Value) -> Vec<String> {
    let Some(obj) = data.as_object() else { return vec!["the file is not a JSON object".into()] };
    let mut problems = Vec::new();
    match obj.get("version") {
        None => {}
        Some(v) if v.as_u64() == Some(VERSION) => {}
        Some(v) => problems.push(format!("version {} is not one this app knows", js::stringify(Some(v)))),
    }
    match obj.get("notes") {
        None => {}
        Some(Value::Array(notes)) => {
            let mut seen: Vec<&str> = Vec::new();
            for (i, n) in notes.iter().enumerate() {
                let at = format!("note {}", i + 1);
                let Some(n) = n.as_object() else { problems.push(format!("{at} is not an object")); continue };
                match n.get("id").and_then(Value::as_str).filter(|id| !js::trim(id).is_empty()) {
                    None => problems.push(format!("{at} has no ID")),
                    Some(id) if seen.contains(&id) => problems.push(format!("{at}: the ID {id} is used twice")),
                    Some(id) => seen.push(id),
                }
                if !n.get("date").and_then(Value::as_str).is_some_and(js::is_real_date) { problems.push(format!("{at}: \"date\" is not a real date written YYYY-MM-DD")); }
                if !n.get("person").and_then(Value::as_str).is_some_and(|p| !js::trim(p).is_empty()) { problems.push(format!("{at} has no person")); }
                if !n.get("text").is_some_and(Value::is_string) { problems.push(format!("{at}: \"text\" is not text")); }
                for key in ["meeting", "item"] {
                    if n.get(key).is_some_and(|v| !v.is_null() && !v.is_string()) { problems.push(format!("{at}: \"{key}\" is not text")); }
                }
            }
        }
        Some(_) => problems.push("\"notes\" is not a list".into()),
    }
    problems
}

pub fn load(ws: &Workspace) -> Result<Loaded, Error> {
    let abs = ws.resolve(FILE)?;
    if !abs.exists() { return Ok(Loaded::Missing); }
    let text = match fs::read(&abs) { Ok(t) => t, Err(e) => return Ok(Loaded::Unreadable(e.to_string())) };
    let data: Value = match serde_json::from_str(&String::from_utf8_lossy(&text)) {
        Ok(v) => v,
        Err(e) => return Ok(Loaded::Unreadable(e.to_string())),
    };
    let problems = validate(&data);
    if !problems.is_empty() { return Ok(Loaded::Unreadable(problems.into_iter().take(3).collect::<Vec<_>>().join("; "))); }
    Ok(Loaded::Ok(data))
}

/// What the pages say when the file can't be read.
pub fn unreadable_message(why: &str) -> String {
    format!("{FILE} {COULD_NOT_READ}: {why}. Nothing will be saved until it is fixed.")
}

/// Every note as saved, and why the file can't be read when it can't (then there are none).
pub struct Notes {
    pub list: Vec<Value>,
    pub error: Option<String>,
}

pub fn read_all(ws: &Workspace) -> Result<Notes, Error> {
    Ok(match load(ws)? {
        Loaded::Missing => Notes { list: Vec::new(), error: None },
        Loaded::Ok(data) => Notes { list: data.get("notes").and_then(Value::as_array).cloned().unwrap_or_default(), error: None },
        Loaded::Unreadable(why) => Notes { list: Vec::new(), error: Some(unreadable_message(&why)) },
    })
}

fn field<'a>(n: &'a Value, key: &str) -> Option<&'a str> {
    n.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}

/// The Name a note is about: its person as people.md has them now, or None when people.md has no such person, or the
/// person is "me".
fn person_of<'a>(n: &Value, people: &'a People) -> Option<&'a Person> {
    let name = people.resolve(field(n, "person")?)?;
    people.people.iter().find(|p| p.name == name).filter(|p| !p.relationship.eq_ignore_ascii_case("me"))
}

/// Newest first: by date, then by when it was written, then by ID.
fn newest_first(list: &mut [&Value]) {
    list.sort_by(|a, b| {
        field(b, "date").cmp(&field(a, "date"))
            .then_with(|| field(b, "created").cmp(&field(a, "created")))
            .then_with(|| field(b, "id").cmp(&field(a, "id")))
    });
}

/// What a page gets for a note. The text only when private notes are asked for. A meeting or an item that is no longer
/// in the summaries is named, with found: false, so the page shows it without a link.
pub fn note_json(n: &Value, ov: &Overview, show_private: bool) -> Value {
    let meeting = field(n, "meeting").map(|file| match ov.meetings.iter().find(|m| m.file == file) {
        Some(m) => json!({ "file": file, "found": true, "date": m.date, "title": m.title }),
        None => json!({ "file": file, "found": false, "date": null, "title": null }),
    });
    let item = field(n, "item").map(|id| match ov.rows.iter().find(|r| r.usable && r.json["id"] == id) {
        Some(r) => json!({ "id": id, "found": true, "title": r.json["text"], "meeting": r.json["sources"][0]["file"] }),
        None => json!({ "id": id, "found": false, "title": null, "meeting": null }),
    });
    let mut out = json!({
        "id": n["id"], "date": n["date"], "person": n["person"], "personKnown": person_of(n, &ov.people).is_some(),
        "meeting": meeting, "item": item, "created": n.get("created").cloned().unwrap_or(Value::Null),
        "updated": n.get("updated").cloned().unwrap_or(Value::Null), "textShown": show_private,
    });
    if show_private { out["text"] = n.get("text").cloned().unwrap_or(Value::Null); }
    out
}

fn list_json<'a>(notes: impl Iterator<Item = &'a Value>, ov: &Overview, show_private: bool) -> Value {
    let mut list: Vec<&Value> = notes.collect();
    newest_first(&mut list);
    json!(list.into_iter().map(|n| note_json(n, ov, show_private)).collect::<Vec<_>>())
}

/// The notes about one person, newest first.
pub fn about<'a>(notes: &'a [Value], people: &'a People, name: &'a str) -> impl Iterator<Item = &'a Value> {
    notes.iter().filter(move |n| person_of(n, people).is_some_and(|p| p.name == name))
}

/// How many notes about a person are dated after `after`, the day of the last meeting with me; all of them when there
/// has been none.
pub fn count_since(notes: &[Value], people: &People, name: &str, after: Option<&str>) -> usize {
    about(notes, people, name).filter(|n| after.is_none_or(|a| field(n, "date").is_some_and(|d| d > a))).count()
}

/// The marker an action item shows on the Board and Today when notes name it: how many, and the person of the newest
/// (whether people.md has them, so the page can link to their page or to the People list). No text.
pub fn markers(notes: &[Value], people: &People) -> HashMap<String, Value> {
    let mut by_item: HashMap<&str, Vec<&Value>> = HashMap::new();
    for n in notes {
        if let Some(id) = field(n, "item") { by_item.entry(id).or_default().push(n); }
    }
    by_item.into_iter().map(|(id, mut list)| {
        newest_first(&mut list);
        let newest = list[0];
        let person = person_of(newest, people);
        let name = person.map_or_else(|| field(newest, "person").unwrap_or("").to_string(), |p| p.name.clone());
        (id.to_string(), json!({ "count": list.len(), "person": name, "personKnown": person.is_some() }))
    }).collect()
}

/// The notes whose person is not in people.md (or is "me"), newest first, for the People page. Never removed.
pub fn not_in_people(notes: &Notes, ov: &Overview, show_private: bool) -> Value {
    list_json(notes.list.iter().filter(|n| person_of(n, &ov.people).is_none()), ov, show_private)
}

/// The open action items a note about this person may name: theirs, and mine from meetings they attended, as their page
/// lists them (cards of my own are not action items). None when the Board or "me" can't be told.
fn items_for(board: Option<(&board::Board, &[Item], &str)>, people: &People, p: &Person) -> Value {
    let Some((b, all, me)) = board else { return json!([]) };
    let f = today::facts(b, people, me, all, p);
    let list = |items: &[&Item]| {
        let mut items: Vec<&Item> = items.iter().copied().filter(|i| !i.card.own).collect();
        items.sort_by(|a, b| today::person_order(a, b));
        items.into_iter().map(|i| json!({ "id": i.card.id, "title": i.card.json["title"] })).collect::<Vec<_>>()
    };
    json!([list(&f.theirs), list(&f.yours)].concat())
}

/// Why notes can't be added, or None when they can.
fn cant_add(people: &People) -> Option<String> {
    (!people.found).then(|| format!("There is no {PEOPLE_FILE} in this workspace, so notes can’t be added."))
}

/// The parts every notes block shares: the file, its state, and whether a note can be added.
fn block_head(notes: &Notes, ov: &Overview) -> Map<String, Value> {
    let cant = cant_add(&ov.people);
    let mut out = Map::new();
    out.insert("file".into(), json!(FILE));
    out.insert("error".into(), json!(notes.error));
    out.insert("canAdd".into(), json!(notes.error.is_none() && cant.is_none()));
    out.insert("cantAdd".into(), json!(cant));
    out.insert("peopleFile".into(), json!(PEOPLE_FILE));
    out.insert("peopleFound".into(), json!(ov.people.found));
    out.insert("asOf".into(), json!(ov.as_of));
    out
}

/// "Notes between meetings" on a person's page: their notes, newest first, and what the box offers: the meetings they
/// attended and the items a note may name. `board` is the Board, everything on it that counts, and "me", when known.
pub(crate) fn person_block(notes: &Notes, ov: &Overview, board: Option<(&board::Board, &[Item], &str)>, p: &Person, show_private: bool) -> Value {
    let mut out = block_head(notes, ov);
    out.insert("list".into(), list_json(about(&notes.list, &ov.people, &p.name), ov, show_private));
    out.insert("meetings".into(), json!(ov.meetings.iter().filter(|m| today::attended(m, &ov.people, &p.name))
        .map(|m| json!({ "file": m.file, "date": m.date, "title": m.title })).collect::<Vec<_>>()));
    out.insert("items".into(), items_for(board, &ov.people, p));
    Value::Object(out)
}

/// "Since this meeting" on a meeting's page: the notes that name it, newest first, and the box: the meeting filled in,
/// the attendees a note may be about, with the items each may name, and the person filled in when exactly one attendee
/// is not me.
pub fn meeting_block(ws: &Workspace, demo: bool, file: &str, show_private: bool) -> Result<Value, Error> {
    let notes = read_all(ws)?;
    let ov = overview(ws, demo)?;
    let people = &ov.people;
    let built = match ledger::load(ws)? {
        ledger::Loaded::Unreadable(_) => None,
        _ => Some(board::build(ws, demo)?),
    };
    let (me, _) = today::who_is_me(people);
    let all = match (&built, &me) { (Some(b), Some(me)) => today::items(b, people, Some(me)), _ => Vec::new() };
    let board = match (&built, &me) { (Some(b), Some(me)) => Some((b, all.as_slice(), me.as_str())), _ => None };
    let m = ov.meetings.iter().find(|m| m.file == file);
    let is_me = |name: &str| people.resolve(name).and_then(|n| people.people.iter().find(|p| p.name == n)).is_some_and(|p| p.relationship.eq_ignore_ascii_case("me"));
    let others: Vec<&String> = m.and_then(|m| m.people.as_ref()).into_iter().flatten().filter(|a| !is_me(a)).collect();
    let mut attendees: Vec<&Person> = Vec::new();
    for a in &others {
        if let Some(p) = people.resolve(a).and_then(|n| people.people.iter().find(|p| p.name == n)) {
            if !attendees.iter().any(|x| x.name == p.name) { attendees.push(p); }
        }
    }
    let mut out = block_head(&notes, &ov);
    out.insert("list".into(), list_json(notes.list.iter().filter(|n| field(n, "meeting") == Some(file)), &ov, show_private));
    out.insert("meeting".into(), json!(file));
    out.insert("people".into(), json!(attendees.iter().map(|p| json!({ "name": p.name, "items": items_for(board, people, p) })).collect::<Vec<_>>()));
    out.insert("person".into(), match (others.as_slice(), attendees.as_slice()) { ([_], [p]) => json!(p.name), _ => Value::Null });
    Ok(Value::Object(out))
}

// ---------- changes ----------

fn now() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// The file to change, with "notes" in place: an empty one when there is no file yet. An unreadable file is an error, so
/// no change goes ahead.
fn read_for_change(ws: &Workspace) -> Result<Value, Error> {
    let mut data = match load(ws)? {
        Loaded::Missing => json!({ "version": VERSION }),
        Loaded::Ok(d) => d,
        Loaded::Unreadable(why) => return Err(err(409, unreadable_message(&why))),
    };
    if !data.get("notes").is_some_and(Value::is_array) { data["notes"] = json!([]); }
    Ok(data)
}

fn notes_mut(data: &mut Value) -> &mut Vec<Value> {
    data["notes"].as_array_mut().unwrap()
}

fn not_found() -> Error {
    err(404, format!("That note is no longer in {FILE}. Reload to see the current notes."))
}

/// A date as sent: a real date written YYYY-MM-DD, no later than the as-of date. None when it was left out or empty.
fn check_date(v: Option<&Value>, as_of: &str) -> Result<Option<String>, Error> {
    let s = match v {
        None | Some(Value::Null) => return Ok(None),
        Some(Value::String(s)) if s.is_empty() => return Ok(None),
        Some(Value::String(s)) if s.len() == 10 && js::is_real_date(s) => s.clone(),
        Some(_) => return Err(err(400, "The date must be a real date written YYYY-MM-DD.")),
    };
    if s.as_str() > as_of { return Err(err(400, format!("The date can’t be later than {as_of}."))); }
    Ok(Some(s))
}

/// The person as sent: one Name from people.md, not "me".
fn check_person(v: Option<&Value>, people: &People) -> Result<String, Error> {
    if let Some(why) = cant_add(people) { return Err(err(409, why)); }
    let written = js::trim(v.and_then(Value::as_str).unwrap_or("")).to_string();
    if written.is_empty() { return Err(err(400, "Choose the person the note is about.")); }
    let p = people.resolve(&written).and_then(|n| people.people.iter().find(|p| p.name == n))
        .ok_or_else(|| err(400, format!("“{written}” is not in {PEOPLE_FILE}.")))?;
    if p.relationship.eq_ignore_ascii_case("me") { return Err(err(400, "A note is about someone else, not you.")); }
    Ok(p.name.clone())
}

/// The text as sent: line breaks kept (Windows ones made plain), spaces at either end taken off, at most 2,000 characters.
fn check_text(v: Option<&Value>) -> Result<String, Error> {
    let s = match v { Some(Value::String(s)) => s.replace("\r\n", "\n").replace('\r', "\n"), Some(Value::Null) | None => String::new(), Some(_) => return Err(err(400, "The note must be text.")) };
    let t = js::trim(&s).to_string();
    if t.is_empty() { return Err(err(400, "Write the note first.")); }
    if js::len(&t) > MAX_TEXT { return Err(err(400, format!("The note is longer than {MAX_TEXT} characters."))); }
    Ok(t)
}

/// A meeting or an item as sent: None when left out, null or empty.
fn optional(v: Option<&Value>, what: &str) -> Result<Option<String>, Error> {
    match v {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(s)) if js::trim(s).is_empty() => Ok(None),
        Some(Value::String(s)) => Ok(Some(s.clone())),
        Some(_) => Err(err(400, format!("The {what} must be text."))),
    }
}

/// The meeting a note names: a summary that its person attended.
fn check_meeting(ws: &Workspace, ov: &Overview, file: &str, person: &str) -> Result<(), Error> {
    if !summary_files(ws)?.iter().any(|f| f == file) { return Err(err(400, format!("There is no summary named “{file}” in meeting-notes/."))); }
    let attended = ov.meetings.iter().find(|m| m.file == file).is_some_and(|m| today::attended(m, &ov.people, person));
    if !attended { return Err(err(400, format!("{person} did not attend {file}."))); }
    Ok(())
}

/// The item a note names: an action item with a usable ID in the summaries, the IDs the Board has.
fn check_item(ov: &Overview, id: &str) -> Result<(), Error> {
    if !ov.rows.iter().any(|r| r.usable && r.json["id"] == id) { return Err(err(400, format!("There is no action item {id} in the summaries."))); }
    Ok(())
}

fn answer(data: &Value, id: &str, ov: &Overview, show_private: bool) -> Value {
    let n = data["notes"].as_array().unwrap().iter().find(|n| n["id"] == id).unwrap();
    json!({ "note": note_json(n, ov, show_private) })
}

/// POST /api/notes: { date (the as-of date if left out), person, text, meeting, item }. A new note, at the end of the
/// file. The answer is the note, with its text only when private notes are asked for.
pub fn add(ws: &Workspace, demo: bool, input: &Map<String, Value>, show_private: bool) -> Result<Value, Error> {
    let mut data = read_for_change(ws)?;
    let ov = overview(ws, demo)?;
    let person = check_person(input.get("person"), &ov.people)?;
    let date = check_date(input.get("date"), &ov.as_of)?.unwrap_or_else(|| ov.as_of.clone());
    let text = check_text(input.get("text"))?;
    let meeting = optional(input.get("meeting"), "meeting")?;
    if let Some(m) = &meeting { check_meeting(ws, &ov, m, &person)?; }
    let item = optional(input.get("item"), "item")?;
    if let Some(i) = &item { check_item(&ov, i)?; }
    let id = loop {
        let id = format!("N-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
        if !notes_mut(&mut data).iter().any(|n| n["id"] == id.as_str()) { break id; }
    };
    notes_mut(&mut data).push(json!({ "id": id, "date": date, "person": person, "meeting": meeting, "item": item, "text": text, "created": now() }));
    write_json_atomic(ws, FILE, &data)?;
    Ok(answer(&data, &id, &ov, show_private))
}

/// PUT /api/notes/<id>: any of { date, person, text, meeting, item }, each checked as when adding. A meeting or an item
/// sent as it already is is not checked again, so a note whose meeting or item is gone can still be edited; the
/// meeting is checked again when the person changes. Every other field of the note is kept.
pub fn edit(ws: &Workspace, demo: bool, id: &str, input: &Map<String, Value>, show_private: bool) -> Result<Value, Error> {
    let mut data = read_for_change(ws)?;
    let ov = overview(ws, demo)?;
    let at = notes_mut(&mut data).iter().position(|n| n["id"] == id).ok_or_else(not_found)?;
    let old = data["notes"][at].clone();
    let mut changes = Map::new();
    let person_changed = input.contains_key("person") && input.get("person").and_then(Value::as_str) != field(&old, "person");
    let person = if person_changed { check_person(input.get("person"), &ov.people)? } else { field(&old, "person").unwrap_or("").to_string() };
    if person_changed { changes.insert("person".into(), json!(person)); }
    if input.contains_key("date") {
        let date = check_date(input.get("date"), &ov.as_of)?.ok_or_else(|| err(400, "The date must be a real date written YYYY-MM-DD."))?;
        changes.insert("date".into(), json!(date));
    }
    if input.contains_key("text") { changes.insert("text".into(), json!(check_text(input.get("text"))?)); }
    let meeting = if input.contains_key("meeting") { optional(input.get("meeting"), "meeting")? } else { field(&old, "meeting").map(str::to_string) };
    if let Some(m) = &meeting {
        if person_changed || field(&old, "meeting") != Some(m.as_str()) { check_meeting(ws, &ov, m, &person)?; }
    }
    if input.contains_key("meeting") { changes.insert("meeting".into(), json!(meeting)); }
    if input.contains_key("item") {
        let item = optional(input.get("item"), "item")?;
        if let Some(i) = item.as_deref().filter(|i| field(&old, "item") != Some(*i)) { check_item(&ov, i)?; }
        changes.insert("item".into(), json!(item));
    }
    let note = data["notes"][at].as_object_mut().unwrap();
    let before = note.clone();
    note.extend(changes);
    if *note != before {
        note.insert("updated".into(), json!(now()));
        write_json_atomic(ws, FILE, &data)?;
    }
    Ok(answer(&data, id, &ov, show_private))
}

/// DELETE /api/notes/<id>.
pub fn delete(ws: &Workspace, id: &str) -> Result<Value, Error> {
    let mut data = read_for_change(ws)?;
    let list = notes_mut(&mut data);
    let at = list.iter().position(|n| n["id"] == id).ok_or_else(not_found)?;
    list.remove(at);
    write_json_atomic(ws, FILE, &data)?;
    Ok(json!({ "deleted": id }))
}
