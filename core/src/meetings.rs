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

static MONTH_RE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(
    r"\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:,\s*(\d{4}))?\b",
    "",
));
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

/// All month-day dates in a cell. A date without a year takes the year written elsewhere in the cell,
/// or else the meeting's year (stepping back a year if that would put it after the meeting). A date
/// that doesn't exist, such as Feb 30, is left out, so the cell reads as "could not read".
pub fn parse_dates(text: &str, meeting_date: &str) -> Vec<String> {
    let cell_year = CELL_YEAR.captures(text).map(|c| c[1].to_string());
    let mut out = Vec::new();
    for m in MONTH_RE.captures_iter(text) {
        let name = m[1].to_lowercase();
        let month = month_number(js::slice_to(&name, 4)).or_else(|| month_number(js::slice_to(&name, 3)));
        let day: u32 = m[2].parse().unwrap();
        let Some(month) = month else { continue };
        if !(1..=31).contains(&day) { continue; }
        let year_text = m.get(3).map(|y| y.as_str().to_string()).or_else(|| cell_year.clone()).unwrap_or_else(|| meeting_date.chars().take(4).collect());
        let year: i64 = js::string_to_number(&year_text) as i64;
        let mut d = iso(year, month, day);
        if m.get(3).is_none() && cell_year.is_none() && d.as_str() > meeting_date { d = iso(year - 1, month, day); }
        if js::is_real_date(&d) { out.push(d); }
    }
    out.sort_by(|a, b| js::cmp_utf16(a, b));
    out
}

// ---------- one meeting ----------

fn header_field(src: &str, name: &str) -> Option<String> {
    let re = js::re(&format!(r"\*\*{}:\*\*\s*([^\n|]+)", regex::escape(name)), "");
    re.captures(src).map(|c| js::trim(&c[1]).to_string())
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

// Header lines such as "**Date:** May 5, 2026 | **Duration:** 4m 12s", before the first section.
const HEADER_FIELDS: [&str; 6] = ["Date", "Duration", "Attendees", "Company", "Type", "Prior context"];
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

pub fn extract_header_fields(src: &str) -> Header {
    static END: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^(##\s|---\s*$)", ""));
    static FIELD_LINE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\*\*[^*]+:\*\*", ""));
    static SEG_SPLIT: LazyLock<fancy_regex::Regex> = LazyLock::new(|| js::fre(r"\s+\|\s+(?=\*\*[^*]+:\*\*)", ""));
    static SEG: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\*\*([^*]+):\*\*\s*(.*)$", ""));
    let lines = split_lines(src);
    let end = lines.iter().position(|l| END.is_match(l));
    let mut fields: Vec<(String, String)> = Vec::new();
    let mut placed = false;
    let mut body = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if end.is_none_or(|e| i < e) && FIELD_LINE.is_match(line) {
            for seg in SEG_SPLIT.split(line) {
                let seg = seg.expect("split");
                if let Some(m) = SEG.captures(seg) {
                    fields.push((js::trim(&m[1]).to_string(), js::trim(&m[2]).to_string()));
                }
            }
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
fn read_table(src: &str, heading: &str, required: &[&str], warn: &mut dyn FnMut(String)) -> Option<(Vec<String>, Vec<Row>)> {
    let lines = section_lines(src, heading)?;
    let Some(table) = parse_table(&lines) else {
        warn(format!("\"{heading}\" table {COULD_NOT_READ}"));
        return Some((Vec::new(), Vec::new()));
    };
    let missing: Vec<&str> = required.iter().copied().filter(|h| !table.header.iter().any(|x| x == h)).collect();
    if !missing.is_empty() {
        warn(format!("\"{heading}\" table {COULD_NOT_READ}: missing column {}", missing.join(", ")));
        return Some((table.header, Vec::new()));
    }
    for l in &table.bad { warn(format!("\"{heading}\" row {COULD_NOT_READ}: {}…", js::slice_to(l, 80))); }
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
    let mut warn = |message: String| warnings.push(Warning { file: file.to_string(), message });

    let file_date = FILE_DATE.captures(file).map(|c| c[1].to_string());
    // A file name that starts with an impossible date (2026-02-30_...) has no date: the name and the
    // header can't both be right, so neither is used.
    let impossible_name = file_date.as_deref().is_some_and(|d| !js::is_real_date(d));
    let mut date = file_date.filter(|_| !impossible_name);
    if impossible_name {
        warn(format!("date {COULD_NOT_READ}: the file name starts with a date that doesn't exist"));
    } else if date.is_none() {
        let d = header_field(&src, "Date");
        date = d.filter(|d| YEAR.is_match(d)).and_then(|d| parse_dates(&d, "9999-12-31").into_iter().next());
        if date.is_none() { warn(format!("date {COULD_NOT_READ}")); }
    }
    let title = TITLE.captures(&src).map(|c| js::trim(&c[1]).to_string()).filter(|t| !t.is_empty());
    let attendees = header_field(&src, "Attendees").filter(|a| !a.is_empty());
    let kind = header_field(&src, "Type").filter(|t| !t.is_empty());
    if attendees.is_none() { warn(format!("attendees {COULD_NOT_READ}")); }
    if kind.is_none() { warn(format!("meeting type {COULD_NOT_READ}")); }

    // The new format has an ID column; the old one a "#" column, whose rows have no ID. Either is read.
    let action_table = read_table(&src, "Action Items", &["Action Item", "Owner", "Status"], &mut warn);
    if action_table.is_none() { warn("no \"Action Items\" section".to_string()); }
    let (action_header, action_rows) = action_table.unwrap_or_default();
    let new_format = action_header.iter().any(|h| h == "ID");
    if !new_format && !action_rows.is_empty() && !action_header.iter().any(|h| h == "#") {
        warn(format!("\"Action Items\" table {COULD_NOT_READ}: missing column ID"));
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
                    warn(format!("action item number {COULD_NOT_READ}: \"{raw}\""));
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

/// The state a "Status now" names with its first word, or None when it starts with none of the three.
fn status_state(status: &str) -> Option<&'static str> {
    let text = plain_text(status);
    let word: String = js::trim(&text).chars().take_while(|c| c.is_alphabetic()).collect();
    match word.to_lowercase().as_str() {
        "open" => Some("open"),
        "done" => Some("done"),
        "dropped" => Some("dropped"),
        _ => None,
    }
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
    /// Each problem with the file it was found in.
    problems: Vec<(String, String)>,
}

/// Every Action Items row is listed. A row whose ID is well formed and used once in the workspace is tracked:
/// a row under "Open Items from Earlier Meetings" in a later meeting with the same ID is a later mention of it,
/// and the last mention is its latest status. Nothing is matched by wording. Earlier-items rows without an ID
/// (a repeated concern, something from outside these meetings) and rows whose ID matches no item are listed
/// on their own. Anything that doesn't fit the format is reported, never guessed.
pub fn build_tracked(meetings: &[Meeting], people: &People, as_of: &str) -> (Vec<TrackedRow>, Vec<Warning>) {
    let mut chrono: Vec<&Meeting> = meetings.iter().filter(|m| m.date.is_some()).collect();
    chrono.sort_by(|a, b| js::locale_compare(a.date.as_deref().unwrap(), b.date.as_deref().unwrap(), false).then_with(|| js::locale_compare(&a.file, &b.file, false)));
    let mut warnings = Vec::new();

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
            warnings.push(Warning { file: m.file.clone(), message });
        }
        for a in &m.action_items {
            let mut problems = Vec::new();
            let label = a.id.clone().unwrap_or_else(|| format!("Action Items row {}", js::number_to_string(a.num)));
            let mut tracked = false;
            match &a.id {
                None if !m.has_ids => {}
                None => problems.push(format!("{label} has no ID, so it is not tracked across meetings")),
                Some(id) => match id_date(id) {
                    None => problems.push(format!("ID \"{id}\" is not in the form A-YYMMDD-n")),
                    Some(d) => {
                        if d != date { problems.push(format!("ID {id}: its date is not the meeting's date, {date}")); }
                        if uses[id] > 1 { problems.push(format!("ID {id} is used more than once in this workspace")); } else { tracked = true; }
                    }
                },
            }
            let due_date = match &a.due_date {
                Some(d) if js::is_real_date(d) => Some(d.clone()),
                Some(d) => { problems.push(format!("{label}: Due date \"{d}\" is not a real date written YYYY-MM-DD")); None }
                None => None,
            };
            let written = js::trim(&plain_text(&a.owner)).to_string();
            let owner = if written.is_empty() {
                problems.push(format!("{label} has no owner"));
                written
            } else if people.found {
                match people.resolve(&written) {
                    Some(name) => name.to_string(),
                    None => { problems.push(format!("{label}: the owner \"{written}\" is not in people.md")); written }
                }
            } else {
                written
            };
            if tracked { by_id.insert(a.id.clone().unwrap(), items.len()); }
            items.push(Tracked {
                key: format!("{}#{}", m.file, js::number_to_string(a.num)),
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
                problems: problems.into_iter().map(|p| (m.file.clone(), p)).collect(),
            });
        }
    }

    for (order, m) in chrono.iter().enumerate() {
        let date = m.date.clone().unwrap();
        for (oi, o) in m.open_items.iter().enumerate() {
            let label = o.id.clone().unwrap_or_else(|| format!("\"{}\"", js::slice_to(&plain_text(&o.text), 60)));
            let mut problems = Vec::new();
            if status_state(&o.status).is_none() {
                problems.push(format!("{label}: \"Status now\" starts with none of Open, Done or Dropped, so it counts as open"));
            }
            let mention = Mention { file: m.file.clone(), date: date.clone(), status: o.status.clone(), kind: "earlier item" };
            if let Some(id) = &o.id {
                if let Some(&i) = by_id.get(id).filter(|&&i| items[i].order < order) {
                    items[i].mentions.push(mention);
                    items[i].problems.extend(problems.into_iter().map(|p| (m.file.clone(), p)));
                    continue;
                }
                problems.insert(0, if id_date(id).is_none() {
                    format!("ID \"{id}\" is not in the form A-YYMMDD-n")
                } else if uses.get(id).is_some_and(|&n| n > 1) {
                    format!("ID {id} is used by more than one action item, so this row is linked to neither")
                } else {
                    format!("ID {id} matches no action item in an earlier meeting")
                });
            }
            let origin = parse_dates(&plain_text(&o.from), &date).into_iter().next();
            // A row with no ID is background, not an action item: its "From" is shown as written, and a date that
            // can't be read from it is not a problem. A date that can be read still orders the table and gives the age.
            let background = o.id.is_none();
            if origin.is_none() && !background {
                warnings.push(Warning { file: m.file.clone(), message: format!("first-seen date {COULD_NOT_READ}: \"{}\"", plain_text(&o.from)) });
            }
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
                problems: problems.into_iter().map(|p| (m.file.clone(), p)).collect(),
            });
        }
    }

    let mut rows: Vec<(Option<String>, String, TrackedRow)> = items.iter().map(|it| {
        let latest = it.mentions.last().unwrap();
        let state = latest.state();
        for (file, message) in &it.problems { warnings.push(Warning { file: file.clone(), message: message.clone() }); }
        let row = json!({
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
            "problems": it.problems.iter().map(|(_, p)| p).collect::<Vec<_>>(),
            "sources": it.mentions.iter().map(|x| json!({ "file": x.file, "date": x.date, "kind": x.kind })).collect::<Vec<_>>(),
        });
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
    // A row that is on the Board shows its card's chip, and an item closed in the ledger its "closed" date. A ledger
    // that can't be read is named, and no chip or date is shown.
    let entries = match ledger::load(ws)? {
        ledger::Loaded::Missing => Some(serde_json::Map::new()),
        ledger::Loaded::Ok(l) => Some(l["items"].as_object().cloned().unwrap_or_default()),
        ledger::Loaded::Unreadable(why) => {
            warnings.push(Warning { file: ledger::FILE.to_string(), message: format!("{COULD_NOT_READ}: {why}, so no chips or \"Closed\" dates are shown") });
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
