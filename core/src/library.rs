// The Library: books.json plus Kevin's own notes files. Only his notes are ever displayed; the core has
// no field for, and never stores, text from the books themselves.
use std::sync::LazyLock;

use serde_json::{json, Map, Value};

use crate::agents::{agent_summaries, AgentSummary};
use crate::markdown::render_markdown;
use crate::meetings::{today_iso, COULD_NOT_READ};
use crate::paths::Workspace;
use crate::store::write_json_atomic;
use crate::{js, Error, Warning};

const FILE: &str = "library/books.json";
static NOTES_FILE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^library\/([\w.-]+\.md)$", ""));
static NOTES_NAME: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^[\w.-]+\.md$", ""));
static ISO_SHAPE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\d{4}-\d{2}-\d{2}$", ""));

fn err(status: u16, message: impl Into<String>) -> Error {
    Error::Status(status, message.into())
}

fn read_books(ws: &Workspace) -> Result<Vec<Value>, Error> {
    let unreadable = |why: String| err(409, format!("{FILE} {COULD_NOT_READ}: {why}. Nothing will be saved until it is fixed."));
    let text = match ws.read_text(FILE) {
        Ok(t) => t,
        Err(Error::NotFound) => return Err(err(404, format!("{FILE} not found"))),
        Err(Error::Path(m) | Error::Internal(m)) => return Err(unreadable(m)),
        Err(e) => return Err(e),
    };
    let books: Value = serde_json::from_str(&text).map_err(|e| unreadable(e.to_string()))?;
    match books {
        Value::Array(list) if list.iter().all(Value::is_object) => Ok(list),
        _ => Err(err(409, format!("{FILE} {COULD_NOT_READ}: expected a list of books. Nothing will be saved until it is fixed."))),
    }
}

fn is_iso_date(v: &Value) -> bool {
    v.as_str().is_some_and(|s| ISO_SHAPE.is_match(s) && js::is_real_date(s))
}

fn cnr() -> Value {
    json!({ "cnr": true })
}

fn nullish(v: Option<&Value>) -> bool {
    matches!(v, None | Some(Value::Null))
}

// Each field is either a clean value or { cnr: true } ("could not read"), never a guess.
fn view_book(b: &Value, index: usize, notes_files: &[String]) -> (Map<String, Value>, Vec<Warning>) {
    let mut warnings = Vec::new();
    let mut field = |name: &str, ok: bool, value: Value| -> Value {
        if ok { return value; }
        warnings.push(Warning { file: FILE.into(), message: format!("book {}, \"{name}\" {COULD_NOT_READ}: {}", index + 1, js::stringify(b.get(name))) });
        cnr()
    };
    let text_ok = |k: &str| b.get(k).and_then(Value::as_str).is_some_and(|s| !js::trim(s).is_empty());
    let get = |k: &str| b.get(k).cloned().unwrap_or(Value::Null);
    let rating = b.get("rating");
    let read = b.get("read");
    let used_by = b.get("used_by");
    let mut view = Map::new();
    view.insert("index".into(), json!(index));
    view.insert("title".into(), field("title", text_ok("title"), get("title")));
    view.insert("author".into(), field("author", text_ok("author"), get("author")));
    let rating_ok = nullish(rating) || rating.is_some_and(|r| js::is_integer(r) && (1.0..=5.0).contains(&r.as_f64().unwrap()));
    view.insert("rating".into(), field("rating", rating_ok, get("rating")));
    let read_ok = matches!(read, Some(Value::Bool(_))) || matches!(read.and_then(Value::as_str), Some("Yes" | "No"));
    let read_value = match read { Some(Value::Bool(true)) => json!("Yes"), Some(Value::Bool(false)) => json!("No"), _ => get("read") };
    view.insert("read".into(), field("read", read_ok, read_value));
    let date_ok = nullish(b.get("date_read")) || b.get("date_read").is_some_and(is_iso_date);
    view.insert("dateRead".into(), field("date_read", date_ok, get("date_read")));
    let used_ok = used_by.is_none() || used_by.and_then(Value::as_array).is_some_and(|a| a.iter().all(Value::is_string));
    view.insert("usedBy".into(), field("used_by", used_ok, used_by.cloned().unwrap_or(json!([]))));
    let notes = b.get("notes");
    let notes_value = if nullish(notes) {
        Value::Null
    } else {
        match notes.and_then(Value::as_str).and_then(|n| NOTES_FILE.captures(n)) {
            None => field("notes", false, Value::Null),
            Some(m) if !notes_files.iter().any(|f| f == &m[1]) => {
                warnings.push(Warning { file: FILE.into(), message: format!("book {}, notes file not found: {}", index + 1, js::string(notes)) });
                json!({ "missing": notes })
            }
            Some(m) => json!({ "file": &m[1], "path": notes }),
        }
    };
    view.insert("notes".into(), notes_value);
    (view, warnings)
}

fn notes_file_list(ws: &Workspace) -> Result<Vec<String>, Error> {
    Ok(ws.list_dir("library", ".md")?.unwrap_or_default().into_iter().filter(|f| NOTES_NAME.is_match(f)).collect())
}

fn used_by_of(b: &Map<String, Value>) -> Vec<String> {
    b["usedBy"].as_array().map(|a| a.iter().filter_map(|u| u.as_str().map(str::to_string)).collect()).unwrap_or_default()
}

fn notes_path(b: &Map<String, Value>) -> Option<String> {
    b["notes"].get("path").and_then(Value::as_str).map(str::to_string)
}

// Cross-check books.json against the agents' Sources lines. Shown only; neither file is changed.
fn cross_check(views: &mut [Map<String, Value>], agents: &[AgentSummary]) -> Vec<String> {
    let mut unlisted = Vec::new();
    let mut checks: Vec<Vec<String>> = vec![Vec::new(); views.len()];
    for (i, b) in views.iter().enumerate() {
        let path = notes_path(b);
        for u in used_by_of(b) {
            let Some(agent) = agents.iter().rev().find(|a| a.name.to_lowercase() == u.to_lowercase()) else { continue };
            if !agent.sources_read { continue; }
            let name = &agent.name;
            match &path {
                None => checks[i].push(format!("Used by {name}, but this book has no notes file for {name} to read.")),
                Some(p) if !agent.notes_files.contains(p) => checks[i].push(format!("Used by {name}, but {name}'s Sources line doesn't mention {p}.")),
                _ => {}
            }
        }
    }
    for a in agents {
        for f in &a.notes_files {
            let books: Vec<usize> = (0..views.len()).filter(|&i| notes_path(&views[i]).as_deref() == Some(f.as_str())).collect();
            if books.is_empty() { unlisted.push(format!("{}'s Sources line mentions {f}, but no book lists it as its notes.", a.name)); }
            for i in books {
                if !used_by_of(&views[i]).iter().any(|u| u.to_lowercase() == a.name.to_lowercase()) {
                    checks[i].push(format!("{}'s Sources line mentions {f}, but this book's Used by doesn't list {}.", a.name, a.name));
                }
            }
        }
    }
    for (b, c) in views.iter_mut().zip(checks) { b.insert("checks".into(), json!(c)); }
    unlisted
}

pub fn library_view(ws: &Workspace) -> Result<Value, Error> {
    let notes_files = notes_file_list(ws)?;
    let agents = agent_summaries(ws)?;
    // A workspace without books.json has no books: an empty page that names the file, not an error.
    // (Adding a book there is still refused: the saving rules are unchanged.)
    if !ws.exists(FILE)? {
        return Ok(json!({
            "books": [], "notesFiles": notes_files, "agents": agents.iter().map(|a| a.name.clone()).collect::<Vec<_>>(),
            "otherChecks": [], "warnings": [], "booksFile": FILE, "booksFileFound": false,
        }));
    }
    let books = read_books(ws)?;
    let (mut views, warnings): (Vec<_>, Vec<_>) = books.iter().enumerate().map(|(i, b)| view_book(b, i, &notes_files)).unzip();
    let other_checks = cross_check(&mut views, &agents);
    Ok(json!({
        "books": views,
        "notesFiles": notes_files,
        "agents": agents.iter().map(|a| a.name.clone()).collect::<Vec<_>>(),
        "otherChecks": other_checks,
        "warnings": warnings.into_iter().flatten().collect::<Vec<_>>(),
        "booksFile": FILE,
        "booksFileFound": true,
    }))
}

// ---------- add / edit ----------

fn clean(input: &Map<String, Value>, notes_files: &[String]) -> Result<Map<String, Value>, Error> {
    static SPACE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\s+", ""));
    let text = |v: Option<&Value>, name: &str, max: usize| -> Result<String, Error> {
        let s = match v { Some(Value::String(s)) => js::trim(&SPACE.replace_all(s, " ")).to_string(), _ => String::new() };
        if s.is_empty() { return Err(err(400, format!("{name} is required"))); }
        if js::len(&s) > max { return Err(err(400, format!("{name} is longer than {max} characters"))); }
        Ok(s)
    };
    let title = text(input.get("title"), "Title", 300)?;
    let author = text(input.get("author"), "Author", 200)?;

    // Number() would also turn true into 1 and [3] into 3; the core refuses anything but a number or text.
    let rating_error = || err(400, "Rating must be 1 to 5, or empty");
    let rating = match input.get("rating") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) if s.is_empty() => None,
        Some(Value::String(s)) => Some(js::string_to_number(s)),
        Some(Value::Number(n)) => Some(n.as_f64().unwrap()),
        Some(_) => return Err(rating_error()),
    };
    if let Some(r) = rating {
        if !(r.is_finite() && r.fract() == 0.0 && (1.0..=5.0).contains(&r)) { return Err(rating_error()); }
    }

    let read = match input.get("read").and_then(Value::as_str) {
        Some(r @ ("Yes" | "No")) => r.to_string(),
        _ => return Err(err(400, "Read must be Yes or No")),
    };

    let date_read = if js::truthy(input.get("date_read")) { input.get("date_read").cloned() } else { None };
    if let Some(d) = &date_read {
        if !is_iso_date(d) { return Err(err(400, "Date read must be a date (YYYY-MM-DD)")); }
        if d.as_str().unwrap() > today_iso().as_str() { return Err(err(400, "Date read can’t be in the future")); }
    }
    if read == "No" {
        if date_read.is_some() { return Err(err(400, "A book you haven’t read can’t have a date read")); }
        if rating.is_some() { return Err(err(400, "A book you haven’t read can’t have a rating")); }
    }

    let used_by = match input.get("used_by").and_then(Value::as_array) {
        Some(list) if list.iter().all(|u| u.as_str().is_some_and(|s| !js::trim(s).is_empty() && js::len(s) <= 80)) => list,
        _ => return Err(err(400, "Used by must be a list of names")),
    };
    let mut names: Vec<String> = Vec::new();
    for u in used_by {
        let t = js::trim(u.as_str().unwrap()).to_string();
        if !names.contains(&t) { names.push(t); }
    }

    let notes = if js::truthy(input.get("notes")) { input.get("notes").cloned() } else { None };
    if let Some(n) = &notes {
        let listed = n.as_str().and_then(|s| NOTES_FILE.captures(s)).is_some_and(|m| notes_files.iter().any(|f| f == &m[1]));
        if !listed { return Err(err(400, "Notes must be one of your notes files in library/")); }
    }

    let mut book = Map::new();
    book.insert("title".into(), json!(title));
    book.insert("author".into(), json!(author));
    book.insert("rating".into(), rating.map(|r| json!(r as i64)).unwrap_or(Value::Null));
    book.insert("read".into(), json!(read));
    book.insert("date_read".into(), date_read.unwrap_or(Value::Null));
    book.insert("used_by".into(), json!(names));
    book.insert("notes".into(), notes.unwrap_or(Value::Null));
    Ok(book)
}

fn same_book(a: &Value, b: &Value) -> bool {
    let key = |v: &Value, k: &str| js::trim(&js::string(v.get(k))).to_lowercase();
    key(a, "title") == key(b, "title") && key(a, "author") == key(b, "author")
}

fn saved(mut view: Value, index: usize) -> Value {
    view["saved"] = json!(index);
    view
}

pub fn add_book(ws: &Workspace, input: &Map<String, Value>) -> Result<Value, Error> {
    let mut books = read_books(ws)?;
    let book = Value::Object(clean(input, &notes_file_list(ws)?)?);
    if let Some(n) = book["notes"].as_str() { ws.resolve(n)?; }
    if books.iter().any(|b| same_book(b, &book)) { return Err(err(400, "That book is already in the library")); }
    books.push(book);
    write_json_atomic(ws, FILE, &Value::Array(books.clone()))?;
    Ok(saved(library_view(ws)?, books.len() - 1))
}

/// `original` is the title and author the form was opened with, so an edit never lands on a different
/// book if books.json changed in the meantime.
pub fn edit_book(ws: &Workspace, index: usize, input: &Map<String, Value>) -> Result<Value, Error> {
    let mut books = read_books(ws)?;
    let changed = || err(409, "books.json has changed since this page loaded. Reload and try again.");
    if let Some(existing) = books.get(index) {
        for (key, name) in [("title", "title"), ("author", "author")] {
            if !existing.get(key).and_then(Value::as_str).is_some_and(|s| !js::trim(s).is_empty()) {
                return Err(err(409, format!("Book {}'s {name} could not be read in {FILE}, so it can't be edited here. Fix it in the file, then reload.", index + 1)));
            }
        }
    }
    let original = input.get("original").filter(|o| js::truthy(Some(o)));
    match (books.get(index), original) {
        (Some(existing), Some(o)) if same_book(existing, o) => {}
        _ => return Err(changed()),
    }
    let book = clean(input, &notes_file_list(ws)?)?;
    if let Some(n) = book["notes"].as_str() { ws.resolve(n)?; }
    let as_value = Value::Object(book.clone());
    if books.iter().enumerate().any(|(i, b)| i != index && same_book(b, &as_value)) {
        return Err(err(400, "Another entry already has that title and author"));
    }
    // Fields the form doesn't show (such as "year") are kept as they are.
    let existing = books[index].as_object_mut().unwrap();
    for (k, v) in book { existing.insert(k, v); }
    write_json_atomic(ws, FILE, &Value::Array(books))?;
    Ok(saved(library_view(ws)?, index))
}

/// Only files that books.json lists as notes are shown, so nothing else in library/ is ever displayed.
pub fn notes_page(ws: &Workspace, file: &str) -> Result<Value, Error> {
    if !NOTES_NAME.is_match(file) { return Err(err(400, "Invalid notes file name")); }
    let path = format!("library/{file}");
    let books = read_books(ws)?;
    let owners: Vec<&Value> = books.iter().filter(|b| b.get("notes").and_then(Value::as_str) == Some(path.as_str())).collect();
    if owners.is_empty() { return Err(err(404, "That file isn’t listed as notes for any book")); }
    if !ws.exists(&path)? { return Err(err(404, format!("{path} not found"))); }
    let html = render_markdown(&ws.read_text(&path)?, false).html;
    let books: Vec<Value> = owners.iter().map(|b| {
        let mut m = Map::new();
        for k in ["title", "author"] { if let Some(v) = b.get(k) { m.insert(k.into(), v.clone()); } }
        Value::Object(m)
    }).collect();
    Ok(json!({ "file": file, "path": path, "books": books, "html": html }))
}
