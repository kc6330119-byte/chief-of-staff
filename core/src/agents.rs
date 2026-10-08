// CLAUDE.md (the coach) and .claude/agents/*.md for the read-only Agents page.
use std::sync::LazyLock;

use serde_json::{json, Value};

use crate::markdown::{render_inline, split_lines};
use crate::meetings::{days_between, parse_dates, today_iso, COULD_NOT_READ};
use crate::paths::Workspace;
use crate::{js, Error, Warning};

const AGENTS_DIR: &str = ".claude/agents";
pub const REVIEW_AFTER_DAYS: i64 = 30;

/// "negotiation-prep" -> "Negotiation prep", the form books.json uses in "used_by".
pub fn display_name(name: &str) -> String {
    static SEP: LazyLock<regex::Regex> = LazyLock::new(|| js::re("[-_]+", ""));
    let spaced = SEP.replace_all(name, " ");
    let s = js::trim(&spaced);
    let mut chars = s.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

struct Frontmatter<'a> {
    meta: Vec<(String, String)>,
    body: &'a str,
}

impl Frontmatter<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.meta.iter().rev().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }
}

fn split_frontmatter(src: &str) -> Frontmatter<'_> {
    static FM: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", ""));
    static KV: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^([\w-]+):\s*(.*)$", ""));
    static QUOTES: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r#"^["']|["']$"#, ""));
    let Some(m) = FM.captures(src) else { return Frontmatter { meta: Vec::new(), body: src } };
    let mut meta = Vec::new();
    for line in split_lines(&m[1]) {
        if let Some(kv) = KV.captures(line) {
            meta.push((kv[1].to_string(), QUOTES.replace_all(js::trim(&kv[2]), "").into_owned()));
        }
    }
    Frontmatter { meta, body: &src[m.get(0).unwrap().end()..] }
}

fn labelled_line(body: &str, label: &str) -> Option<String> {
    let re = js::re(&format!(r"^\**{}:\**\s*(.+)$", regex::escape(label)), "im");
    re.captures(body).map(|c| js::trim(&c[1]).to_string())
}

fn parse_reviewed(value: Option<&str>) -> Option<String> {
    static ISO: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^(\d{4})-(\d{2})-(\d{2})$", ""));
    static YEAR: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\b\d{4}\b", ""));
    let value = value.filter(|v| !v.is_empty())?;
    if ISO.is_match(value) { return js::is_real_date(value).then(|| value.to_string()); }
    let written = parse_dates(value, "9999-12-31");
    if YEAR.is_match(value) && written.len() == 1 { written.into_iter().next() } else { None }
}

// The numbered rules: top-level "1." items, with wrapped lines joined. The line or heading just before
// the first item is kept as a caption ("When I give you a plan or a draft:").
fn parse_rules(body: &str) -> (Option<String>, Vec<String>) {
    static ITEM: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^(\d+)\.\s+(.*)$", ""));
    static WRAPPED: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\s{2,}\S", ""));
    static HASHES: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^#+\s*", ""));
    let lines = split_lines(body);
    let mut rules: Vec<String> = Vec::new();
    let mut caption = None;
    let mut current = false;
    for (i, line) in lines.iter().enumerate() {
        if let Some(item) = ITEM.captures(line) {
            if rules.is_empty() {
                if let Some(prev) = lines[..i].iter().rev().find(|l| !js::trim(l).is_empty()) {
                    caption = Some(js::trim(&HASHES.replace(prev, "")).to_string());
                }
            }
            rules.push(item[2].to_string());
            current = true;
        } else if current && WRAPPED.is_match(line) {
            let last = rules.last_mut().unwrap();
            last.push(' ');
            last.push_str(js::trim(line));
        } else if current && !js::trim(line).is_empty() {
            // A second, separate numbered list is not part of the same rule set.
            break;
        }
    }
    (caption, rules)
}

fn parse_instruction_file(ws: &Workspace, rel: &str, fallback_name: &str) -> Result<Value, Error> {
    let mut warnings = Vec::new();
    let mut warn = |message: String| warnings.push(Warning { file: rel.to_string(), message });
    let src = ws.read_text(rel)?;
    let fm = split_frontmatter(&src);
    let body = fm.body;

    let name = fm.get("name").filter(|n| !n.is_empty()).unwrap_or(fallback_name).to_string();
    if name.is_empty() { warn(format!("name {COULD_NOT_READ}")); }
    let purpose = labelled_line(body, "Purpose");
    let sources = labelled_line(body, "Sources");
    let reviewed_raw = labelled_line(body, "Last reviewed");
    let last_reviewed = parse_reviewed(reviewed_raw.as_deref());
    // A label followed only by spaces reads as an empty value, which counts as missing.
    let present = |v: &Option<String>| v.as_deref().is_some_and(|s| !s.is_empty());
    if !present(&purpose) { warn(format!("\"Purpose:\" line {COULD_NOT_READ}")); }
    if !present(&sources) { warn(format!("\"Sources:\" line {COULD_NOT_READ}")); }
    if last_reviewed.is_none() {
        let raw = reviewed_raw.as_ref().filter(|r| !r.is_empty()).map(|r| format!(" (\"{r}\")")).unwrap_or_default();
        warn(format!("\"Last reviewed:\" date {COULD_NOT_READ}{raw}"));
    }
    let (caption, rules) = parse_rules(body);
    if rules.is_empty() { warn(format!("rules {COULD_NOT_READ}: no numbered list found")); }

    let today = today_iso();
    let days_since = last_reviewed.as_deref().and_then(|d| days_between(d, &today));
    let tools = fm.get("tools").filter(|t| !t.is_empty());
    Ok(json!({
        "file": rel,
        "name": if name.is_empty() { Value::Null } else { json!(display_name(&name)) },
        "id": if name.is_empty() { Value::Null } else { json!(name) },
        "tools": tools,
        "sources": sources,
        "purposeHtml": purpose.as_deref().filter(|p| !p.is_empty()).map(render_inline),
        "sourcesHtml": sources.as_deref().filter(|s| !s.is_empty()).map(render_inline),
        "lastReviewed": last_reviewed,
        "lastReviewedText": reviewed_raw,
        "daysSince": days_since,
        "reviewDue": days_since.is_some_and(|d| d > REVIEW_AFTER_DAYS),
        "rulesCaption": caption,
        "rulesHtml": rules.iter().map(|r| render_inline(r)).collect::<Vec<_>>(),
        "warnings": warnings,
    }))
}

pub fn load_agents(ws: &Workspace) -> Result<Value, Error> {
    let mut warnings: Vec<Value> = Vec::new();
    let mut cards = Vec::new();

    if ws.exists("CLAUDE.md")? {
        let mut card = parse_instruction_file(ws, "CLAUDE.md", "Coach")?;
        card["name"] = json!("Coach");
        card["role"] = json!("coach");
        cards.push(card);
    } else {
        warnings.push(json!({ "file": "CLAUDE.md", "message": "not found" }));
    }

    let files = ws.list_dir(AGENTS_DIR, ".md")?;
    for f in files.iter().flatten() {
        let mut card = parse_instruction_file(ws, &format!("{AGENTS_DIR}/{f}"), f.strip_suffix(".md").unwrap_or(f))?;
        card["role"] = json!("agent");
        cards.push(card);
    }

    for c in &cards { warnings.extend(c["warnings"].as_array().unwrap().iter().cloned()); }
    Ok(json!({
        "cards": cards,
        "agentsFolderFound": files.is_some(),
        "agentsFolder": AGENTS_DIR,
        "today": today_iso(),
        "reviewAfterDays": REVIEW_AFTER_DAYS,
        "warnings": warnings,
    }))
}

pub struct AgentSummary {
    pub name: String,
    pub sources_read: bool,
    pub notes_files: Vec<String>,
}

/// What a book's "used_by" can point at: the coach plus each agent, with the notes files each one's
/// Sources line names explicitly (a folder such as "library/" doesn't count as naming a file).
pub fn agent_summaries(ws: &Workspace) -> Result<Vec<AgentSummary>, Error> {
    static NOTES: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\blibrary\/[\w.-]+\.md\b", ""));
    let agents = load_agents(ws)?;
    Ok(agents["cards"].as_array().unwrap().iter().filter(|c| c["name"].as_str().is_some_and(|n| !n.is_empty())).map(|c| {
        let sources = c["sources"].as_str();
        let mut notes_files: Vec<String> = Vec::new();
        for m in NOTES.find_iter(sources.unwrap_or("")) {
            if !notes_files.iter().any(|f| f == m.as_str()) { notes_files.push(m.as_str().to_string()); }
        }
        AgentSummary { name: c["name"].as_str().unwrap().to_string(), sources_read: sources.is_some(), notes_files }
    }).collect())
}
