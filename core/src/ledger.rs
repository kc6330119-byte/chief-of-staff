// actions/ledger.json: the only place the app records what I did with an action item. It holds one entry per ID
// (column, closed date, my due date, a note, when I accepted a suggestion, the date of the last report I have seen
// and kept the item as it was; for my own cards, C-…, the card itself) and the order I put each column in. The file is handled as plain JSON, so fields the app doesn't know are kept.
// It is created on the first change, never on a read.
use std::fs;

use serde_json::{json, Map, Value};

use crate::meetings::COULD_NOT_READ;
use crate::paths::Workspace;
use crate::store::write_json_atomic;
use crate::{js, Error};

pub const FILE: &str = "actions/ledger.json";
pub const COLUMNS: [&str; 3] = ["todo", "doing", "done"];
const VERSION: u64 = 1;

pub enum Loaded {
    Missing,
    Ok(Value),
    /// Why it could not be read. Nothing is written over it.
    Unreadable(String),
}

fn is_date(v: &Value) -> bool {
    v.as_str().is_some_and(js::is_real_date)
}

// Checks the whole file. If any part is off, the ledger is unreadable and nothing is written, so a hand-edited
// file is never overwritten with a guess.
fn validate(ledger: &Value) -> Vec<String> {
    let Some(obj) = ledger.as_object() else { return vec!["the file is not a JSON object".into()] };
    let mut problems = Vec::new();
    match obj.get("version") {
        None => {}
        Some(v) if v.as_u64() == Some(VERSION) => {}
        Some(v) => problems.push(format!("version {} is not one this app knows", js::stringify(Some(v)))),
    }
    match obj.get("items") {
        None => {}
        Some(Value::Object(items)) => {
            for (id, entry) in items {
                let at = format!("entry {id}");
                if entry.is_array() { problems.push(format!("{at} is a list, not an object")); continue; }
                let Some(e) = entry.as_object() else { problems.push(format!("{at} is not an object")); continue };
                if let Some(c) = e.get("column") {
                    if !c.as_str().is_some_and(|c| COLUMNS.contains(&c)) { problems.push(format!("{at} has an unknown column \"{}\"", js::string(Some(c)))); }
                }
                for key in ["closed", "due", "accepted", "reportSeen"] {
                    if let Some(v) = e.get(key).filter(|v| !v.is_null()) {
                        if !is_date(v) { problems.push(format!("{at}: \"{key}\" is not a real date written YYYY-MM-DD")); }
                    }
                }
                if e.get("note").is_some_and(|n| !n.is_null() && !n.is_string()) { problems.push(format!("{at}: \"note\" is not text")); }
                if id.starts_with("C-") {
                    if !e.get("title").and_then(Value::as_str).is_some_and(|t| !js::trim(t).is_empty()) { problems.push(format!("{at} is a card of my own with no title")); }
                    for key in ["owner", "meeting"] {
                        if e.get(key).is_some_and(|v| !v.is_null() && !v.is_string()) { problems.push(format!("{at}: \"{key}\" is not text")); }
                    }
                }
            }
        }
        Some(_) => problems.push("\"items\" is not an object of entries by ID".into()),
    }
    match obj.get("order") {
        None => {}
        Some(Value::Object(order)) => {
            for c in COLUMNS {
                if let Some(list) = order.get(c) {
                    if !list.as_array().is_some_and(|a| a.iter().all(Value::is_string)) { problems.push(format!("the order of \"{c}\" is not a list of IDs")); }
                }
            }
        }
        Some(_) => problems.push("\"order\" is not an object".into()),
    }
    problems
}

pub fn load(ws: &Workspace) -> Result<Loaded, Error> {
    let abs = ws.resolve(FILE)?;
    if !abs.exists() { return Ok(Loaded::Missing); }
    let text = match fs::read(&abs) { Ok(t) => t, Err(e) => return Ok(Loaded::Unreadable(e.to_string())) };
    let ledger: Value = match serde_json::from_str(&String::from_utf8_lossy(&text)) {
        Ok(v) => v,
        Err(e) => return Ok(Loaded::Unreadable(e.to_string())),
    };
    let problems = validate(&ledger);
    if !problems.is_empty() { return Ok(Loaded::Unreadable(problems.into_iter().take(3).collect::<Vec<_>>().join("; "))); }
    Ok(Loaded::Ok(ledger))
}

/// What the Board and Today say when the file can't be read.
pub fn unreadable_message(why: &str) -> String {
    format!("{FILE} {COULD_NOT_READ}: {why}. Nothing will be saved until it is fixed.")
}

/// The ledger with "items" and "order" in place: an empty one when there is no file yet. An unreadable file is an
/// error, so neither the Board nor a change can go ahead.
pub fn read(ws: &Workspace) -> Result<Value, Error> {
    let mut ledger = match load(ws)? {
        Loaded::Missing => json!({ "version": VERSION }),
        Loaded::Ok(l) => l,
        Loaded::Unreadable(why) => return Err(Error::Status(409, unreadable_message(&why))),
    };
    let obj = ledger.as_object_mut().unwrap();
    if !obj.get("items").is_some_and(Value::is_object) { obj.insert("items".into(), json!({})); }
    if !obj.get("order").is_some_and(Value::is_object) { obj.insert("order".into(), json!({})); }
    Ok(ledger)
}

pub fn save(ws: &Workspace, ledger: &Value) -> Result<(), Error> {
    write_json_atomic(ws, FILE, ledger)
}

pub fn items(ledger: &Value) -> &Map<String, Value> {
    ledger["items"].as_object().unwrap()
}

pub fn items_mut(ledger: &mut Value) -> &mut Map<String, Value> {
    ledger["items"].as_object_mut().unwrap()
}

/// An entry's text field, or None when it is missing, null or empty.
pub fn text<'a>(entry: Option<&'a Value>, key: &str) -> Option<&'a str> {
    entry.and_then(|e| e.get(key)).and_then(Value::as_str).filter(|s| !s.is_empty())
}

/// The column an entry puts its card in; no entry or no column is To do.
pub fn column(entry: Option<&Value>) -> &str {
    text(entry, "column").unwrap_or("todo")
}

/// The date an entry closed its item: only while it is in Done.
pub fn closed_on(entry: &Value) -> Option<String> {
    (column(Some(entry)) == "done").then(|| text(Some(entry), "closed").map(str::to_string)).flatten()
}

/// The IDs a column was put in order with, as saved.
pub fn order(ledger: &Value, col: &str) -> Vec<String> {
    ledger["order"].get(col).and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default()
}

/// Saves `ids` as a column's order and takes them out of the other columns' orders.
pub fn set_order(ledger: &mut Value, col: &str, ids: Vec<String>) {
    let order = ledger["order"].as_object_mut().unwrap();
    for c in COLUMNS.iter().filter(|c| **c != col) {
        if let Some(list) = order.get_mut(*c).and_then(Value::as_array_mut) { list.retain(|v| !ids.iter().any(|id| v.as_str() == Some(id))); }
    }
    order.insert(col.to_string(), json!(ids));
}

/// Takes an ID out of every column's order.
pub fn drop_from_order(ledger: &mut Value, id: &str) {
    let order = ledger["order"].as_object_mut().unwrap();
    for c in COLUMNS {
        if let Some(list) = order.get_mut(c).and_then(Value::as_array_mut) { list.retain(|v| v.as_str() != Some(id)); }
    }
}
