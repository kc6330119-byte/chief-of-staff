// Meeting summaries and the "Tracked items across all meetings" roll-up.
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use serde_json::{json, Value};

use crate::markdown::{parse_table, plain_text, render_inline, section_lines, split_lines, Row};
use crate::paths::Workspace;
use crate::people::{load_people, People, FILE as PEOPLE_FILE};
use crate::{js, ledger, Error, Warning};

pub const COULD_NOT_READ: &str = "could not read";
const MEETINGS_DIR: &str = "meeting-notes";

// ---------- dates (kept as YYYY-MM-DD strings so time zones never shift them) ----------

fn month_number(name: &str) -> Option<u32> {
    Some(match name {
        "jan" => 1, "feb" => 2, "mar" => 3, "apr" => 4, "may" => 5, "jun" => 6, "jul" => 7, "aug" => 8,
        "sep" | "sept" => 9, "oct" => 10, "nov" => 11, "dec" => 12,
        _ => return None,
    })
}

const MONTH_NAME: &str = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
static MONTH_RE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(&format!(r"\b{MONTH_NAME}\.?\s+(\d{{1,2}})(?:,\s*(\d{{4}}))?\b"), ""));
// Day first: "13 August 2026", "13 Aug 2026", "13 Aug".
static DAY_FIRST_RE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(&format!(r"\b(\d{{1,2}})\s+{MONTH_NAME}\.?(?:,?\s+(\d{{4}}))?\b"), ""));
static ISO_RE: LazyLock<fancy_regex::Regex> = LazyLock::new(|| js::fre(r"(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)", ""));
static CELL_YEAR: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\b(20\d\d)\b", ""));

pub fn iso(y: i64, m: u32, d: u32) -> String {
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn today_iso() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Whole days from a to b, or None if either is not a real date.
pub fn days_between(a: &str, b: &str) -> Option<i64> {
    Some(js::date_days(b)? - js::date_days(a)?)
}

/// A date written with a month name. Without a year it takes the year written elsewhere in the cell, or else the
/// meeting's year (stepping back a year if that would put it after the meeting). None when the date doesn't exist.
fn month_name_date(month: &str, day: &str, year: Option<&str>, cell_year: Option<&str>, meeting_date: &str) -> Option<String> {
    let name = month.to_lowercase();
    let month = month_number(js::slice_to(&name, 4)).or_else(|| month_number(js::slice_to(&name, 3)))?;
    let day: u32 = day.parse().unwrap();
    if !(1..=31).contains(&day) { return None; }
    let year_text = year.or(cell_year).map(str::to_string).unwrap_or_else(|| meeting_date.chars().take(4).collect());
    let y = js::string_to_number(&year_text) as i64;
    let mut d = iso(y, month, day);
    if year.is_none() && cell_year.is_none() && d.as_str() > meeting_date { d = iso(y - 1, month, day); }
    js::is_real_date(&d).then_some(d)
}

/// All month-day dates in a cell ("Aug 13, 2026", "Aug 13"). A date that doesn't exist, such as Feb 30, is left out,
/// so the cell reads as "could not read". The agents' "Last reviewed" is read with this alone.
pub fn parse_dates(text: &str, meeting_date: &str) -> Vec<String> {
    let cell_year = CELL_YEAR.captures(text).map(|c| c[1].to_string());
    let mut out: Vec<String> = MONTH_RE.captures_iter(text)
        .filter_map(|m| month_name_date(&m[1], &m[2], m.get(3).map(|y| y.as_str()), cell_year.as_deref(), meeting_date))
        .collect();
    out.sort_by(|a, b| js::cmp_utf16(a, b));
    out
}

/// All dates in a summary's cell or header: those parse_dates reads, and also YYYY-MM-DD ("2026-08-13") and day first
/// ("13 August 2026", "13 Aug"). Where the same month name reads both ways ("1:1 May 5"), the month-first reading is
/// kept, as before. Dates in numbers alone (03/08/2026, 8/13) are never read: they could mean two different days.
pub fn parse_summary_dates(text: &str, meeting_date: &str) -> Vec<String> {
    let cell_year = CELL_YEAR.captures(text).map(|c| c[1].to_string());
    let month_first: HashSet<usize> = MONTH_RE.captures_iter(text).map(|m| m.get(1).unwrap().start()).collect();
    let mut out = parse_dates(text, meeting_date);
    for m in DAY_FIRST_RE.captures_iter(text) {
        if month_first.contains(&m.get(2).unwrap().start()) { continue; }
        out.extend(month_name_date(&m[2], &m[1], m.get(3).map(|y| y.as_str()), cell_year.as_deref(), meeting_date));
    }
    for m in ISO_RE.captures_iter(text) {
        let m = m.expect("date pattern");
        let d = format!("{}-{}-{}", &m[1], &m[2], &m[3]);
        if js::is_real_date(&d) { out.push(d); }
    }
    out.sort_by(|a, b| js::cmp_utf16(a, b));
    out
}

// ---------- one meeting ----------

/// A header field's value, read as the meeting page reads it: the first field of that name in the file.
fn header_field(src: &str, name: &str) -> Option<String> {
    file_fields(&split_lines(src)).1.into_iter().find(|(n, _)| n == name).map(|(_, v)| v)
}

fn split_top_level(s: &str) -> Vec<String> {
    static PARENS: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\([^)]*\)", ""));
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut cur = String::new();
    for c in s.chars() {
        if c == '(' { depth += 1; }
        if c == ')' { depth -= 1; }
        if c == ',' && depth == 0 { parts.push(std::mem::take(&mut cur)); continue; }
        cur.push(c);
    }
    parts.push(cur);
    parts.iter().map(|p| js::trim(&PARENS.replace_all(p, "")).to_string()).filter(|p| !p.is_empty()).collect()
}

/// Owners are the names outside parentheses: "Riley Brooks (Praveen Iyer secondary)" is owned by Riley.
pub fn owner_names(owner: &str) -> Vec<String> {
    static AND: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\s+(?:and|&)\s+", ""));
    split_top_level(&plain_text(owner)).iter()
        .flat_map(|n| AND.split(n).map(|x| js::trim(x).to_string()).collect::<Vec<_>>())
        .filter(|n| !n.is_empty())
        .collect()
}

// Header lines such as "**Date:** May 5, 2026 | **Duration:** 4m 12s", before the first "##" heading or "---" line.
const HEADER_FIELDS: [&str; 6] = ["Date", "Duration", "Attendees", "Company", "Type", "Prior context"];
/// Other names a summary gives a field, read as that field.
const FIELD_SYNONYMS: [(&str, &str); 2] = [("participants", "Attendees"), ("meeting type", "Type")];
pub const FIELDS_PLACEHOLDER: &str = "MCHEADERFIELDS";

pub struct HeaderField {
    pub name: String,
    pub value: Option<String>,
}

pub struct Header {
    pub fields: Vec<HeaderField>,
    pub missing: Vec<String>,
    pub body: String,
}

/// The field a name stands for, in any capitals: one of HEADER_FIELDS or a synonym of one.
fn known_field(name: &str) -> Option<&'static str> {
    let name = name.to_lowercase();
    HEADER_FIELDS.into_iter().find(|f| f.to_lowercase() == name)
        .or_else(|| FIELD_SYNONYMS.iter().find(|(s, _)| *s == name).map(|(_, f)| *f))
}

// A field is written **Name:**, **Name**: or, for a field the app reads, plain Name:, in any capitals. A bold field the
// app reads is found anywhere in the file, as 0.3.1 found it; a plain one only on a field line in the header.
const KNOWN_NAMES: &str = "date|duration|attendees|company|type|prior context|participants|meeting type";
static BOLD_FIELD: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\*\*([^*]+?)(?::\*\*|\*\*:)\s*(.*)$", ""));
static PLAIN_FIELD: LazyLock<regex::Regex> = LazyLock::new(|| js::re(&format!(r"^({KNOWN_NAMES}):\s*(.*)$"), "i"));
// Elsewhere, a bold field the app reads anywhere in a line; its value runs to the end of the line or to a "|".
static BOLD_ANYWHERE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(&format!(r"\*\*({KNOWN_NAMES})(?::\*\*|\*\*:)[ \t]*([^\n|]*)"), "i"));
// More fields can follow on the same line after " | ".
static FIELD_SPLIT: LazyLock<fancy_regex::Regex> = LazyLock::new(|| js::fre(&format!(r"\s+\|\s+(?=\*\*[^*]+(?::\*\*|\*\*:)|(?i:{KNOWN_NAMES}):)"), ""));

/// One field: its name (a field the app reads by its own name) and its value.
fn read_field(seg: &str) -> Option<(String, String)> {
    let (name, value) = BOLD_FIELD.captures(seg).or_else(|| PLAIN_FIELD.captures(seg)).map(|m| (js::trim(&m[1]).to_string(), js::trim(&m[2]).to_string()))?;
    Some((known_field(&name).map(str::to_string).unwrap_or(name), value))
}

/// For each line, its fields if it is a field line in the header (one that starts with a field), else None.
fn header_lines(lines: &[&str]) -> Vec<Option<Vec<(String, String)>>> {
    static END: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^(##\s|---\s*$)", ""));
    let end = lines.iter().position(|l| END.is_match(l)).unwrap_or(lines.len());
    lines.iter().enumerate().map(|(i, line)| {
        if i >= end || read_field(line).is_none() { return None; }
        Some(FIELD_SPLIT.split(line).filter_map(|seg| read_field(seg.expect("split"))).collect())
    }).collect()
}

/// Every field in the file, in order, and for each line whether it is a field line in the header. A field line's
/// fields are read in any form and by any name; on every other line, only the bold fields the app reads.
fn file_fields(lines: &[&str]) -> (Vec<bool>, Vec<(String, String)>) {
    let mut field_line = Vec::new();
    let mut fields = Vec::new();
    for (line, read) in lines.iter().zip(header_lines(lines)) {
        field_line.push(read.is_some());
        match read {
            Some(read) => fields.extend(read),
            None => fields.extend(BOLD_ANYWHERE.captures_iter(line)
                .map(|m| (known_field(&m[1]).expect("a known name").to_string(), js::trim(&m[2]).to_string()))),
        }
    }
    (field_line, fields)
}

pub fn extract_header_fields(src: &str) -> Header {
    let lines = split_lines(src);
    let (field_line, fields) = file_fields(&lines);
    let mut placed = false;
    let mut body = Vec::new();
    // Only the header's field lines are shown as fields in place of the lines; a bold field further down stays
    // where it is written, and also gives its value to the fields.
    for (line, is_field_line) in lines.iter().zip(field_line) {
        if is_field_line {
            if !placed { body.push(FIELDS_PLACEHOLDER.to_string()); placed = true; }
            continue;
        }
        body.push(line.to_string());
    }
    let named: HashSet<&str> = fields.iter().map(|(n, _)| n.as_str()).collect();
    let missing = HEADER_FIELDS.iter().filter(|n| !named.contains(**n)).map(|n| n.to_string()).collect();
    let mut ordered: Vec<HeaderField> = HEADER_FIELDS.iter().map(|n| HeaderField {
        name: n.to_string(),
        value: fields.iter().find(|(f, _)| f == n).map(|(_, v)| v.clone()),
    }).collect();
    ordered.extend(fields.iter().filter(|(n, _)| !HEADER_FIELDS.contains(&n.as_str())).map(|(n, v)| HeaderField { name: n.clone(), value: Some(v.clone()) }));
    Header { fields: ordered, missing, body: body.join("\n") }
}

pub struct ActionItem {
    /// The row number: the "#" cell in the old format, the row's place in the table in the new one.
    pub num: f64,
    /// The ID cell as written; None when it is empty or the table has no ID column (the old format).
    pub id: Option<String>,
    pub text: String,
    pub owner: String,
    pub due: Option<String>,
    pub due_date: Option<String>,
    pub status: String,
}

pub struct OpenItem {
    pub id: Option<String>,
    pub from: String,
    pub text: String,
    pub owner: String,
    pub status: String,
}

pub struct Meeting {
    pub file: String,
    pub date: Option<String>,
    pub title: String,
    pub people: Option<Vec<String>>,
    pub kind: Option<String>,
    /// The Action Items table has an ID column. A summary in the old format has a "#" column instead.
    pub has_ids: bool,
    pub action_items: Vec<ActionItem>,
    pub open_items: Vec<OpenItem>,
    pub warnings: Vec<Warning>,
}

/// The rows of the first table under `heading`, with its column names; None when there is no such section.
fn read_table(src: &str, heading: &str, required: &[&str], warn: &mut dyn FnMut(&str, &[&str])) -> Option<(Vec<String>, Vec<Row>)> {
    let lines = section_lines(src, heading)?;
    let Some(table) = parse_table(&lines) else {
        warn(&format!("\"{heading}\" table {COULD_NOT_READ}"), &[]);
        return Some((Vec::new(), Vec::new()));
    };
    let missing: Vec<&str> = required.iter().copied().filter(|h| !table.header.iter().any(|x| x == h)).collect();
    if !missing.is_empty() {
        warn(&format!("\"{heading}\" table {COULD_NOT_READ}: missing column {}", missing.join(", ")), &[]);
        return Some((table.header, Vec::new()));
    }
    for l in &table.bad { warn(&format!("\"{heading}\" row {COULD_NOT_READ}: {{}}…"), &[js::slice_to(l, 80)]); }
    Some((table.header, table.rows))
}

/// A cell as plain text, or None when it is empty.
fn non_empty(cell: Option<&str>) -> Option<String> {
    cell.map(|c| js::trim(&plain_text(c)).to_string()).filter(|c| !c.is_empty())
}

pub fn parse_meeting(ws: &Workspace, file: &str) -> Result<Meeting, Error> {
    static FILE_DATE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^(\d{4}-\d{2}-\d{2})", ""));
    static YEAR: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\d{4}", ""));
    static TITLE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^#\s+(.+)$", "m"));
    let src = ws.read_text(&format!("{MEETINGS_DIR}/{file}"))?;
    let mut warnings = Vec::new();
    // A message, or a template whose "{}" are filled with the parts that vary (see Warning::varied).
    let mut warn = |template: &str, parts: &[&str]| warnings.push(
        if parts.is_empty() { Warning::new(file, template) } else { Warning::varied(file, template, parts) });

    let file_date = FILE_DATE.captures(file).map(|c| c[1].to_string());
    // A file name that starts with an impossible date (2026-02-30_...) has no date: the name and the
    // header can't both be right, so neither is used.
    let impossible_name = file_date.as_deref().is_some_and(|d| !js::is_real_date(d));
    let mut date = file_date.filter(|_| !impossible_name);
    if impossible_name {
        warn(&format!("date {COULD_NOT_READ}: the file name starts with a date that doesn't exist"), &[]);
    } else if date.is_none() {
        let d = header_field(&src, "Date");
        date = d.filter(|d| YEAR.is_match(d)).and_then(|d| parse_summary_dates(&d, "9999-12-31").into_iter().next());
        if date.is_none() { warn(&format!("date {COULD_NOT_READ}"), &[]); }
    }
    let title = TITLE.captures(&src).map(|c| js::trim(&c[1]).to_string()).filter(|t| !t.is_empty());
    let attendees = header_field(&src, "Attendees").filter(|a| !a.is_empty());
    let kind = header_field(&src, "Type").filter(|t| !t.is_empty());
    if attendees.is_none() { warn(&format!("attendees {COULD_NOT_READ}"), &[]); }
    if kind.is_none() { warn(&format!("meeting type {COULD_NOT_READ}"), &[]); }

    // The new format has an ID column; the old one a "#" column, whose rows have no ID. Either is read.
    let action_table = read_table(&src, "Action Items", &["Action Item", "Owner", "Status"], &mut warn);
    if action_table.is_none() { warn("no \"Action Items\" section", &[]); }
    let (action_header, action_rows) = action_table.unwrap_or_default();
    let new_format = action_header.iter().any(|h| h == "ID");
    if !new_format && !action_rows.is_empty() && !action_header.iter().any(|h| h == "#") {
        warn(&format!("\"Action Items\" table {COULD_NOT_READ}: missing column ID"), &[]);
    }
    let (_, open_rows) = read_table(&src, "Open Items from Earlier Meetings", &["From", "Item", "Owner", "Status now"], &mut warn).unwrap_or_default();

    let mut action_items = Vec::new();
    if new_format || action_header.iter().any(|h| h == "#") {
        for (i, r) in action_rows.iter().enumerate() {
            let num = if new_format {
                (i + 1) as f64
            } else {
                let raw = r.get("#").unwrap_or("");
                let num = js::string_to_number(&plain_text(raw));
                if !(num.is_finite() && num.fract() == 0.0 && num >= 1.0) {
                    warn(&format!("action item number {COULD_NOT_READ}: \"{{}}\""), &[raw]);
                    continue;
                }
                num
            };
            action_items.push(ActionItem {
                num,
                id: non_empty(r.get("ID")),
                text: r.get("Action Item").unwrap_or("").to_string(),
                owner: r.get("Owner").unwrap_or("").to_string(),
                due: non_empty(r.get("Due")),
                due_date: non_empty(r.get("Due date")),
                status: r.get("Status").unwrap_or("").to_string(),
            });
        }
    }
    let open_items = open_rows.iter().map(|r| OpenItem {
        id: non_empty(r.get("ID")),
        from: r.get("From").unwrap_or("").to_string(),
        text: r.get("Item").unwrap_or("").to_string(),
        owner: r.get("Owner").unwrap_or("").to_string(),
        status: r.get("Status now").unwrap_or("").to_string(),
    }).collect();

    Ok(Meeting {
        file: file.to_string(),
        date,
        title: title.unwrap_or_else(|| COULD_NOT_READ.to_string()),
        people: attendees.map(|a| split_top_level(&a)),
        kind,
        has_ids: new_format,
        action_items,
        open_items,
        warnings,
    })
}

/// The summaries' file names: the .md files in meeting-notes/, none if the folder is missing. These are the only
/// names a meeting is opened or linked by. A folder whose name ends in .md is not a summary (decision 77).
pub fn summary_files(ws: &Workspace) -> Result<Vec<String>, Error> {
    let mut files = Vec::new();
    for name in ws.list_dir(MEETINGS_DIR, ".md")?.unwrap_or_default() {
        if ws.resolve(&format!("{MEETINGS_DIR}/{name}"))?.is_file() { files.push(name); }
    }
    Ok(files)
}

/// Every summary, newest first; undated meetings go last.
pub fn load_meetings(ws: &Workspace) -> Result<Vec<Meeting>, Error> {
    let files = summary_files(ws)?;
    let mut meetings = files.iter().map(|f| parse_meeting(ws, f)).collect::<Result<Vec<_>, _>>()?;
    meetings.sort_by(|a, b| {
        js::locale_compare(b.date.as_deref().unwrap_or(""), a.date.as_deref().unwrap_or(""), false)
            .then_with(|| js::locale_compare(&a.file, &b.file, false))
    });
    Ok(meetings)
}

// ---------- roll-up ----------

pub fn is_suggested(text: &str, status: &str) -> bool {
    static IN_TEXT: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\(suggested", "i"));
    static IN_STATUS: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^suggested\b", "i"));
    IN_TEXT.is_match(text) || IN_STATUS.is_match(&plain_text(status))
}

/// The meeting date an ID names (A-YYMMDD-n, or A-YYMMDDx-n for a later meeting that day), as YYYY-MM-DD;
/// None when the ID is not in that form.
fn id_date(id: &str) -> Option<String> {
    static SHAPE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^A-(\d\d)(\d\d)(\d\d)[a-z]?-[1-9]\d*$", ""));
    SHAPE.captures(id).map(|c| format!("20{}-{}-{}", &c[1], &c[2], &c[3]))
}

/// The words a "Status now" may start with, in any capitals, and the state each names.
const STATUS_WORDS: [(&str, &str); 18] = [
    ("Open", "open"), ("In progress", "open"), ("Ongoing", "open"), ("Pending", "open"), ("Still open", "open"),
    ("Not started", "open"), ("Blocked", "open"), ("Partially", "open"),
    ("Done", "done"), ("Closed", "done"), ("Completed", "done"), ("Complete", "done"), ("Resolved", "done"), ("Finished", "done"),
    ("Dropped", "dropped"), ("Cancelled", "dropped"), ("Canceled", "dropped"), ("Abandoned", "dropped"),
];

/// The state a "Status now" names with its first word or words, or None when it starts with none of STATUS_WORDS.
fn status_state(status: &str) -> Option<&'static str> {
    let text = plain_text(status);
    let text = js::trim(&text);
    // The first two words, each a run of letters; the second only when a space alone comes between them.
    let first: String = text.chars().take_while(|c| c.is_alphabetic()).collect();
    let rest = &text[first.len()..];
    let second: String = rest.trim_start_matches(js::is_ws).chars().take_while(|c| c.is_alphabetic()).collect();
    let two = (rest.starts_with(js::is_ws) && !second.is_empty()).then(|| format!("{first} {second}"));
    STATUS_WORDS.iter()
        .find(|(w, _)| w.eq_ignore_ascii_case(&first) || two.as_ref().is_some_and(|t| w.eq_ignore_ascii_case(t)))
        .map(|(_, state)| *state)
}

/// The words a "Status now" may start with, as a warning lists them: "Open, In progress, … or Abandoned".
fn status_words_text() -> String {
    let words: Vec<&str> = STATUS_WORDS.iter().map(|(w, _)| *w).collect();
    format!("{} or {}", words[..words.len() - 1].join(", "), words[words.len() - 1])
}

struct Mention {
    file: String,
    date: String,
    status: String,
    kind: &'static str,
}

impl Mention {
    /// The state this mention reports. An item's own Action Items status is not a "Status now": it is open.
    fn state(&self) -> &'static str {
        if self.kind == "earlier item" { status_state(&self.status).unwrap_or("open") } else { "open" }
    }
}

/// One row of the roll-up, with what the Board needs besides the row the Meetings page shows.
pub struct TrackedRow {
    pub json: Value,
    /// An action item whose ID is well formed and used once in the workspace: it is on the Board.
    pub usable: bool,
    /// Each mention's date and the state it reports, oldest first.
    pub mentions: Vec<(String, &'static str)>,
}

struct Tracked {
    key: String,
    id: Option<String>,
    kind: &'static str,
    text: String,
    owner: String,
    due: Option<String>,
    due_date: Option<String>,
    first_seen: Option<String>,
    first_seen_text: Option<String>,
    suggested: bool,
    /// The place of its first meeting in date order; a later mention must come from a later meeting.
    order: usize,
    usable: bool,
    mentions: Vec<Mention>,
    /// An earlier item whose ID names a meeting from before the oldest summary: it has no action item to match.
    before_first: bool,
    /// Each problem, with the file it was found in.
    problems: Vec<Warning>,
}

/// Every Action Items row is listed. A row whose ID is well formed and used once in the workspace is tracked:
/// a row under "Open Items from Earlier Meetings" in a later meeting with the same ID is a later mention of it,
/// and the last mention is its latest status. Nothing is matched by wording. Earlier-items rows without an ID
/// (a repeated concern, something from outside these meetings) and rows whose ID matches no item are listed
/// on their own; rows whose ID names a meeting from before the oldest summary are one row per ID, as that
/// meeting isn't here to give them an action item. Anything that doesn't fit the format is reported, never guessed.
pub fn build_tracked(meetings: &[Meeting], people: &People, as_of: &str) -> (Vec<TrackedRow>, Vec<Warning>) {
    let mut chrono: Vec<&Meeting> = meetings.iter().filter(|m| m.date.is_some()).collect();
    chrono.sort_by(|a, b| js::locale_compare(a.date.as_deref().unwrap(), b.date.as_deref().unwrap(), false).then_with(|| js::locale_compare(&a.file, &b.file, false)));
    let mut warnings = Vec::new();
    let oldest = chrono.first().and_then(|m| m.date.clone());

    // How often each well-formed ID is given to an action item. An ID used twice can't say which item it means.
    let mut uses: HashMap<String, usize> = HashMap::new();
    for a in chrono.iter().flat_map(|m| &m.action_items) {
        if let Some(id) = a.id.as_ref().filter(|id| id_date(id).is_some()) { *uses.entry(id.clone()).or_default() += 1; }
    }

    let mut items: Vec<Tracked> = Vec::new();
    let mut by_id: HashMap<String, usize> = HashMap::new();
    for (order, m) in chrono.iter().enumerate() {
        let date = m.date.clone().unwrap();
        // A summary in the old format has no IDs at all: one warning for the file, not one per row.
        if !m.has_ids && !m.action_items.is_empty() {
            let n = m.action_items.len();
            let message = if n == 1 { "1 Action Items row has no ID, so it is not tracked across meetings".to_string() }
                else { format!("{n} Action Items rows have no ID, so they are not tracked across meetings") };
            warnings.push(Warning { file: m.file.clone(), message, kind: Some("… Action Items rows have no ID, so they are not tracked across meetings".into()) });
        }
        for a in &m.action_items {
            let mut problems = Vec::new();
            let mut problem = |template: &str, parts: &[&str]| problems.push(Warning::varied(&m.file, template, parts));
            let num = js::number_to_string(a.num);
            let label = a.id.clone().unwrap_or_else(|| format!("Action Items row {num}"));
            let mut tracked = false;
            match &a.id {
                None if !m.has_ids => {}
                None => problem("Action Items row {} has no ID, so it is not tracked across meetings", &[&num]),
                Some(id) => match id_date(id) {
                    None => problem("ID \"{}\" is not in the form A-YYMMDD-n", &[id]),
                    Some(d) => {
                        if d != date { problem("ID {}: its date is not the meeting's date, {}", &[id, &date]); }
                        if uses[id] > 1 { problem("ID {} is used more than once in this workspace", &[id]); } else { tracked = true; }
                    }
                },
            }
            let due_date = match &a.due_date {
                Some(d) if js::is_real_date(d) => Some(d.clone()),
                Some(d) => { problem("{}: Due date \"{}\" is not a real date written YYYY-MM-DD", &[&label, d]); None }
                None => None,
            };
            let written = js::trim(&plain_text(&a.owner)).to_string();
            let owner = if written.is_empty() {
                problem("{} has no owner", &[&label]);
                written
            } else if people.found {
                match people.resolve(&written) {
                    Some(name) => name.to_string(),
                    None => { problem("{}: the owner \"{}\" is not in people.md", &[&label, &written]); written }
                }
            } else {
                written
            };
            if tracked { by_id.insert(a.id.clone().unwrap(), items.len()); }
            items.push(Tracked {
                key: format!("{}#{}", m.file, num),
                id: a.id.clone(),
                kind: "action item",
                text: a.text.clone(),
                owner,
                due: a.due.clone(),
                due_date,
                first_seen: Some(date.clone()),
                first_seen_text: None,
                suggested: is_suggested(&a.text, &a.status),
                order,
                usable: tracked,
                mentions: vec![Mention { file: m.file.clone(), date: date.clone(), status: a.status.clone(), kind: "action item" }],
                before_first: false,
                problems,
            });
        }
    }

    // Earlier items whose ID names a meeting from before the oldest summary, by ID: each is one row.
    let mut before_first: HashMap<String, usize> = HashMap::new();
    let status_template = format!("{{}}: \"Status now\" starts with none of {}, so it counts as open", status_words_text());
    for (order, m) in chrono.iter().enumerate() {
        let date = m.date.clone().unwrap();
        for (oi, o) in m.open_items.iter().enumerate() {
            let label = o.id.clone().unwrap_or_else(|| format!("\"{}\"", js::slice_to(&plain_text(&o.text), 60)));
            let mut problems = Vec::new();
            if status_state(&o.status).is_none() { problems.push(Warning::varied(&m.file, &status_template, &[&label])); }
            let mention = Mention { file: m.file.clone(), date: date.clone(), status: o.status.clone(), kind: "earlier item" };
            let mut from_before_first = false;
            if let Some(id) = &o.id {
                let earlier = by_id.get(id).filter(|&&i| items[i].order < order).or_else(|| before_first.get(id));
                if let Some(&i) = earlier {
                    items[i].mentions.push(mention);
                    items[i].problems.extend(problems);
                    continue;
                }
                // No action item has this ID, and it names a day before the oldest summary: its meeting isn't here.
                from_before_first = !uses.contains_key(id)
                    && id_date(id).is_some_and(|d| js::is_real_date(&d) && oldest.as_deref().is_some_and(|o| d.as_str() < o));
                if !from_before_first {
                    let (template, parts): (&str, &[&str]) = if id_date(id).is_none() {
                        ("ID \"{}\" is not in the form A-YYMMDD-n", &[id])
                    } else if uses.get(id).is_some_and(|&n| n > 1) {
                        ("ID {} is used by more than one action item, so this row is linked to neither", &[id])
                    } else {
                        ("ID {} matches no action item in an earlier meeting", &[id])
                    };
                    problems.insert(0, Warning::varied(&m.file, template, parts));
                }
            }
            // A well-formed ID holds the date of the meeting the item came from, so a "From" that can't be read loses nothing.
            let origin = parse_summary_dates(&plain_text(&o.from), &date).into_iter().next()
                .or_else(|| o.id.as_deref().and_then(id_date).filter(|d| js::is_real_date(d)));
            // A row with no ID is background, not an action item: its "From" is shown as written, and a date that
            // can't be read from it is not a problem. A date that can be read still orders the table and gives the age.
            let background = o.id.is_none();
            if origin.is_none() && !background {
                warnings.push(Warning::varied(&m.file, &format!("first-seen date {COULD_NOT_READ}: \"{{}}\""), &[&plain_text(&o.from)]));
            }
            if from_before_first { before_first.insert(o.id.clone().unwrap(), items.len()); }
            let written = js::trim(&plain_text(&o.owner)).to_string();
            items.push(Tracked {
                key: format!("{}#open-{}", m.file, oi + 1),
                id: o.id.clone(),
                kind: "earlier item",
                text: o.text.clone(),
                owner: people.resolve(&written).map(str::to_string).unwrap_or(written),
                due: None,
                due_date: None,
                first_seen_text: if origin.is_some() && !background { None } else { Some(plain_text(&o.from)) },
                first_seen: origin,
                suggested: is_suggested(&o.text, ""),
                order,
                usable: false,
                mentions: vec![mention],
                before_first: from_before_first,
                problems,
            });
        }
    }

    let mut rows: Vec<(Option<String>, String, TrackedRow)> = items.iter().map(|it| {
        let latest = it.mentions.last().unwrap();
        let state = latest.state();
        warnings.extend(it.problems.iter().cloned());
        let mut row = json!({
            "key": it.key,
            "id": it.id,
            "kind": it.kind,
            "text": plain_text(&it.text),
            "textHtml": render_inline(&it.text),
            "owner": if it.owner.is_empty() { Value::Null } else { json!(it.owner) },
            "due": it.due,
            "dueDate": it.due_date,
            "firstSeen": it.first_seen,
            "firstSeenText": it.first_seen_text,
            "ageDays": it.first_seen.as_deref().and_then(|f| days_between(f, as_of)),
            "latestStatus": plain_text(&latest.status),
            "latestStatusHtml": render_inline(&latest.status),
            "state": state,
            "suggested": it.suggested,
            "problems": it.problems.iter().map(|p| &p.message).collect::<Vec<_>>(),
            "sources": it.mentions.iter().map(|x| json!({ "file": x.file, "date": x.date, "kind": x.kind })).collect::<Vec<_>>(),
        });
        // Shown as "from before your first saved summary"; only such a row has it.
        if it.before_first { row["beforeFirstSummary"] = json!(true); }
        let mentions = it.mentions.iter().map(|x| (x.date.clone(), x.state())).collect();
        (it.first_seen.clone(), it.key.clone(), TrackedRow { json: row, usable: it.usable, mentions })
    }).collect();
    // Oldest first; rows whose first-seen date could not be read go last.
    rows.sort_by(|a, b| {
        js::locale_compare(a.0.as_deref().unwrap_or("9999"), b.0.as_deref().unwrap_or("9999"), false)
            .then_with(|| js::locale_compare(&a.1, &b.1, true))
    });
    (rows.into_iter().map(|r| r.2).collect(), warnings)
}

/// The summaries and their roll-up, as the Meetings page and the Board both use them.
pub struct Overview {
    pub meetings: Vec<Meeting>,
    pub people: People,
    /// "Today": the real date, or in the sample the newest meeting's date.
    pub as_of: String,
    pub as_of_is_newest_meeting: bool,
    pub rows: Vec<TrackedRow>,
    pub warnings: Vec<Warning>,
}

pub fn overview(ws: &Workspace, demo: bool) -> Result<Overview, Error> {
    let meetings = load_meetings(ws)?;
    let people = load_people(ws)?;
    let newest = meetings.iter().find_map(|m| m.date.clone());
    let as_of = match (&newest, demo) { (Some(n), true) => n.clone(), _ => today_iso() };
    let (rows, tracked_warnings) = build_tracked(&meetings, &people, &as_of);
    let warnings = meetings.iter().flat_map(|m| m.warnings.clone()).chain(tracked_warnings).chain(people.warnings.clone()).collect();
    Ok(Overview { as_of_is_newest_meeting: demo && newest.is_some(), meetings, people, as_of, rows, warnings })
}

/// Only the owners of action items, one name per item, sorted. A row that is not an action item never adds a name.
pub fn action_item_owners<'a>(rows: impl Iterator<Item = &'a Value>) -> Vec<String> {
    let mut owners: Vec<String> = Vec::new();
    for r in rows.filter(|r| r["kind"] == "action item") {
        if let Some(o) = r["owner"].as_str() {
            if !owners.iter().any(|x| x == o) { owners.push(o.to_string()); }
        }
    }
    owners.sort_by(|a, b| js::cmp_utf16(a, b));
    owners
}

pub fn meetings_overview(ws: &Workspace, demo: bool) -> Result<Value, Error> {
    let o = overview(ws, demo)?;
    let mut warnings = o.warnings;
    // A row that is on the Board shows its card's chip and its column, and an item closed in the ledger its "closed"
    // date. A ledger that can't be read is named, and no chip, column or date is shown.
    let entries = match ledger::load(ws)? {
        ledger::Loaded::Missing => Some(serde_json::Map::new()),
        ledger::Loaded::Ok(l) => Some(l["items"].as_object().cloned().unwrap_or_default()),
        ledger::Loaded::Unreadable(why) => {
            warnings.push(Warning::new(ledger::FILE, format!("{COULD_NOT_READ}: {why}, so no chips or \"Closed\" dates are shown")));
            None
        }
    };
    let tracked: Vec<Value> = o.rows.into_iter().map(|r| {
        let card = match (&entries, r.usable) {
            (Some(entries), true) => Some(crate::board::item_card(&r, r.json["id"].as_str().and_then(|id| entries.get(id)), &o.as_of)),
            _ => None,
        };
        let mut row = r.json;
        row["closed"] = card.as_ref().map_or(Value::Null, |c| c["closed"].clone());
        row["column"] = card.as_ref().map_or(Value::Null, |c| c["column"].clone());
        row["chip"] = card.map_or(Value::Null, |c| c["chip"].clone());
        row
    }).collect();
    Ok(json!({
        "asOf": o.as_of,
        "asOfIsNewestMeeting": o.as_of_is_newest_meeting,
        "meetings": o.meetings.iter().map(|m| json!({ "file": m.file, "date": m.date, "title": m.title, "people": m.people, "type": m.kind })).collect::<Vec<_>>(),
        "owners": action_item_owners(tracked.iter()),
        "tracked": tracked,
        "peopleFile": { "file": PEOPLE_FILE, "fileFound": o.people.found },
        "warnings": warnings,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_summary_date_reads_iso_and_day_first_as_well() {
        for text in ["2026-08-13", "13 August 2026", "13 Aug 2026", "13 Aug", "Aug 13, 2026", "Aug 13", "13 Aug. 2026"] {
            assert_eq!(parse_summary_dates(text, "2026-10-12"), ["2026-08-13"], "{text}");
        }
        // Without a year, a day-first date takes the cell's year, or the meeting's, stepping back past the meeting.
        assert_eq!(parse_summary_dates("13 Dec", "2026-10-12"), ["2025-12-13"]);
        assert_eq!(parse_summary_dates("13 Aug (Riley 1:1, 2025)", "2026-10-12"), ["2025-08-13"]);
        assert_eq!(parse_summary_dates("2026-08-13_riley-1-1.md", "2026-10-12"), ["2026-08-13"]);
    }

    #[test]
    fn a_date_that_reads_two_ways_or_does_not_exist_is_not_read() {
        for text in ["03/08/2026", "8/13", "8/13/2026", "2026-02-30", "30 Feb 2026", "2026-13-08", "12026-08-13", "2026-08-130", "earlier"] {
            assert_eq!(parse_summary_dates(text, "2026-10-12"), Vec::<String>::new(), "{text}");
        }
    }

    #[test]
    fn a_month_name_between_two_numbers_keeps_its_month_first_reading() {
        assert_eq!(parse_summary_dates("Sam 1:1 May 5", "2026-10-12"), ["2026-05-05"]);
        assert_eq!(parse_summary_dates("Praveen 1:1 Jul 28; Sep 8", "2026-10-12"), ["2026-07-28", "2026-09-08"]);
    }

    #[test]
    fn header_fields_are_read_in_three_forms_any_capitals_and_by_their_other_names() {
        let fields = |src: &str| extract_header_fields(src).fields.into_iter().map(|f| (f.name, f.value)).collect::<Vec<_>>();
        for src in [
            "# T\n\n**Attendees:** Sam, Kevin\n**Type:** 1:1\n",
            "# T\n\n**Attendees**: Sam, Kevin\n**Type**: 1:1\n",
            "# T\n\nAttendees: Sam, Kevin\nType: 1:1\n",
            "# T\n\n**ATTENDEES:** Sam, Kevin | **type**: 1:1\n",
            "# T\n\nParticipants: Sam, Kevin | Meeting type: 1:1\n",
            "# T\n\n**participants:** Sam, Kevin\n**Meeting Type**: 1:1\n",
        ] {
            let f = fields(src);
            assert_eq!(f[2], ("Attendees".to_string(), Some("Sam, Kevin".to_string())), "{src}");
            assert_eq!(f[4], ("Type".to_string(), Some("1:1".to_string())), "{src}");
            assert_eq!(header_field(src, "Attendees").as_deref(), Some("Sam, Kevin"), "{src}");
            assert_eq!(header_field(src, "Type").as_deref(), Some("1:1"), "{src}");
            assert!(!extract_header_fields(src).body.contains("Sam"), "{src}");
        }
    }

    #[test]
    fn a_bold_field_is_read_anywhere_and_a_plain_one_only_on_a_header_line() {
        for src in [
            "# T\n\n---\n\n**Attendees:** Sam\n",
            "# T\n\n## Meeting info\n\n**Attendees**: Sam\n",
            "# T\n\n## Meeting info\n\n**participants:** Sam\n",
            "# T\n\nWe met. **Attendees:** Sam | 30 minutes\n",
        ] {
            assert_eq!(header_field(src, "Attendees").as_deref(), Some("Sam"), "{src}");
            let header = extract_header_fields(src);
            assert_eq!(header.fields[2].value.as_deref(), Some("Sam"), "{src}");
            assert!(!header.missing.iter().any(|n| n == "Attendees"), "{src}");
            // It stays where it is written.
            assert!(header.body.contains("Sam"), "{src}");
        }
        assert_eq!(header_field("# T\n\n## Meeting info\n\n**Meeting type:** 1:1\n", "Type").as_deref(), Some("1:1"));
        for src in [
            "# T\n\n---\n\nAttendees: Sam\n",
            "# T\n\n## Meeting info\n\nAttendees: Sam\n",
            "# T\n\n## Meeting info\n\nParticipants: Sam\n",
            "# T\n\nWe met. Attendees: Sam\n",
            "# T\n\nPeople: Sam\n",
        ] {
            assert_eq!(header_field(src, "Attendees"), None, "{src}");
            assert_eq!(extract_header_fields(src).fields[2].value, None, "{src}");
        }
        // The header's own field comes first.
        assert_eq!(header_field("# T\n\n**Attendees:** Sam\n\n## Meeting info\n\n**Attendees:** Kevin\n", "Attendees").as_deref(), Some("Sam"));
        // A plain "Name:" line is a field only for a field the app reads; a bold field by another name only in the header.
        assert!(extract_header_fields("# T\n\nNote: rescheduled\n").fields.iter().all(|f| f.name != "Note"));
        assert!(extract_header_fields("# T\n\n**Note**: rescheduled\n").fields.iter().any(|f| f.name == "Note"));
        assert!(extract_header_fields("# T\n\n---\n\n**Note**: rescheduled\n").fields.iter().all(|f| f.name != "Note"));
    }

    #[test]
    fn status_words_and_their_synonyms() {
        for (status, state) in [
            ("Open", Some("open")), ("in progress, half done", Some("open")), ("Ongoing.", Some("open")), ("PENDING", Some("open")),
            ("Still open: waiting", Some("open")), ("Not started", Some("open")), ("Blocked on Dana", Some("open")), ("Partially done", Some("open")),
            ("**Done.**", Some("done")), ("Closed", Some("done")), ("completed", Some("done")), ("Complete", Some("done")),
            ("Resolved.", Some("done")), ("Finished", Some("done")),
            ("Dropped", Some("dropped")), ("Cancelled", Some("dropped")), ("Canceled", Some("dropped")), ("abandoned", Some("dropped")),
            ("Handed over", None), ("Not done", None), ("Still", None), ("In-progress", None), ("Opened", None), ("Closing", None), ("", None),
        ] {
            assert_eq!(status_state(status), state, "{status}");
        }
    }

    #[test]
    fn the_month_first_reader_is_unchanged() {
        assert_eq!(parse_dates("Aug 13, 2026", "9999-12-31"), ["2026-08-13"]);
        for text in ["2026-08-13", "13 August 2026", "13 Aug"] {
            assert_eq!(parse_dates(text, "9999-12-31"), Vec::<String>::new(), "{text}");
        }
    }
}
