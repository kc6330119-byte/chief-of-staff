// The corrections log: corrections/corrections.json. New entries are appended; nothing else in the file
// (such as its top-level "note") is changed.
use std::sync::LazyLock;

use serde_json::{json, Map, Value};

use crate::meetings::{today_iso, COULD_NOT_READ};
use crate::paths::Workspace;
use crate::store::write_json_atomic;
use crate::{js, Error, Warning};

const FILE: &str = "corrections/corrections.json";
const FIELDS: [&str; 6] = ["date", "where", "what", "caught_by", "decision", "rule"];

fn max_len(f: &str) -> usize {
    match f { "date" => 10, "where" | "caught_by" => 200, "rule" => 500, _ => 1500 }
}

fn label(f: &str) -> &'static str {
    match f {
        "date" => "Date", "where" => "Where", "what" => "What happened", "caught_by" => "Who caught it",
        "decision" => "My decision", _ => "The rule it became",
    }
}

fn err(status: u16, message: impl Into<String>) -> Error {
    Error::Status(status, message.into())
}

// The file is either { ..., "entries": [...] } or a bare list. Either shape is written back as found.
fn read_log(ws: &Workspace) -> Result<Value, Error> {
    let unreadable = |why: String| err(409, format!("{FILE} {COULD_NOT_READ}: {why}. Nothing will be saved until it is fixed."));
    let text = match ws.read_text(FILE) {
        Ok(t) => t,
        Err(Error::NotFound) => return Err(err(404, format!("{FILE} not found"))),
        Err(Error::Path(m) | Error::Internal(m)) => return Err(unreadable(m)),
        Err(e) => return Err(e),
    };
    let data: Value = serde_json::from_str(&text).map_err(|e| unreadable(e.to_string()))?;
    if entries(&data).is_none() { return Err(unreadable("no list of entries".into())); }
    Ok(data)
}

fn entries(data: &Value) -> Option<&Vec<Value>> {
    data.as_array().or_else(|| data.get("entries").and_then(Value::as_array))
}

/// A date as written: YYYY, YYYY-MM or YYYY-MM-DD, and a real date.
pub fn is_partial_date(v: Option<&Value>) -> bool {
    static SHAPE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$", ""));
    let Some(s) = v.and_then(Value::as_str) else { return false };
    let Some(m) = SHAPE.captures(s) else { return false };
    if let Some(mo) = m.get(2) { if !("01"..="12").contains(&mo.as_str()) { return false; } }
    if m.get(3).is_some() { return js::is_real_date(s); }
    true
}

fn view_of(data: &Value) -> Value {
    let list = entries(data).unwrap();
    let mut warnings = Vec::new();
    let rows: Vec<Value> = list.iter().enumerate().map(|(index, e)| {
        let mut row = Map::new();
        row.insert("index".into(), json!(index));
        if !e.is_object() {
            warnings.push(Warning { file: FILE.into(), message: format!("entry {} {COULD_NOT_READ}", index + 1) });
            for f in FIELDS { row.insert(f.into(), json!({ "cnr": true })); }
            return Value::Object(row);
        }
        for f in FIELDS {
            let v = e.get(f);
            let ok = if f == "date" { is_partial_date(v) } else { v.and_then(Value::as_str).is_some_and(|s| !js::trim(s).is_empty()) };
            if ok {
                row.insert(f.into(), v.unwrap().clone());
            } else {
                row.insert(f.into(), json!({ "cnr": true }));
                warnings.push(Warning { file: FILE.into(), message: format!("entry {}, \"{f}\" {COULD_NOT_READ}: {}", index + 1, js::stringify(v)) });
            }
        }
        Value::Object(row)
    }).collect();
    json!({
        "total": list.len(),
        "note": data.get("note").and_then(Value::as_str),
        "entries": rows,
        "warnings": warnings,
        "file": FILE,
        "fileFound": true,
    })
}

pub fn corrections_view(ws: &Workspace) -> Result<Value, Error> {
    // A workspace without the log has no corrections: an empty page that names the file, not an error.
    // (Adding an entry there is still refused: the saving rules are unchanged.)
    if !ws.exists(FILE)? {
        return Ok(json!({ "total": 0, "note": null, "entries": [], "warnings": [], "file": FILE, "fileFound": false }));
    }
    Ok(view_of(&read_log(ws)?))
}

pub fn add_correction(ws: &Workspace, input: &Map<String, Value>) -> Result<Value, Error> {
    static SPACES: LazyLock<regex::Regex> = LazyLock::new(|| js::re("[ \t]+", ""));
    let mut data = read_log(ws)?;
    let mut entry = Map::new();
    for f in FIELDS {
        let s = match input.get(f) { Some(Value::String(s)) => js::trim(&SPACES.replace_all(s, " ")).to_string(), _ => String::new() };
        if s.is_empty() { return Err(err(400, format!("{} is required", label(f)))); }
        if js::len(&s) > max_len(f) { return Err(err(400, format!("{} is longer than {} characters", label(f), max_len(f)))); }
        entry.insert(f.into(), json!(s));
    }
    // Existing entries may have a partial date such as "2026-09" (shown as written); a new entry needs a full one.
    let date = entry["date"].as_str().unwrap().to_string();
    if !(date.len() == 10 && js::is_real_date(&date)) { return Err(err(400, "Date must be a real date, written YYYY-MM-DD")); }
    if date.as_str() > today_iso().as_str() { return Err(err(400, "Date can’t be in the future")); }
    let list = entries(&data).unwrap();
    let dup = list.iter().any(|e| ["date", "where", "what"].iter().all(|k| e.get(*k).is_some() && e.get(*k) == entry.get(*k)));
    if dup { return Err(err(400, "That entry is already in the log")); }
    let list = if data.is_array() { data.as_array_mut().unwrap() } else { data["entries"].as_array_mut().unwrap() };
    list.push(Value::Object(entry));
    let saved = list.len() - 1;
    write_json_atomic(ws, FILE, &data)?;
    let mut view = view_of(&data);
    view["saved"] = json!(saved);
    Ok(view)
}
