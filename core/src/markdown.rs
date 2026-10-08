// Markdown rendering in the core. Raw HTML in the source is escaped so it shows as text and never runs,
// images show only their alt text, unsafe links are dropped, and "Manager-only note" items are removed
// unless the caller asks for private notes.
use std::collections::HashSet;
use std::fmt::Write;
use std::sync::LazyLock;

use comrak::nodes::{AstNode, NodeValue};
use comrak::{create_formatter, parse_document, Arena, Options};

use crate::js;

/// Escapes & < > " and '.
pub fn escape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

static SAFE_HREF: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^(https?:|mailto:|#|\.{0,2}\/|[\w.-]+(\/|$|#|\.))", "i"));
static PRIVATE_MARK: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^[\s*_]*manager-only note", "i"));

fn options() -> Options<'static> {
    let mut o = Options::default();
    o.extension.table = true;
    o.extension.strikethrough = true;
    o.extension.autolink = true;
    o.extension.tasklist = true;
    // Raw HTML is escaped by the formatter below. Any path it doesn't cover drops the HTML instead.
    o.render.r#unsafe = false;
    o
}

type Private = HashSet<usize>;

fn id(node: &AstNode<'_>) -> usize {
    node as *const _ as usize
}

/// The alt text as written, which is what an image shows: inline marks and raw HTML kept
/// as text (emphasis is written back with "*").
fn alt_text<'a>(node: &'a AstNode<'a>) -> String {
    node.children().map(|n| match &n.data().value {
        NodeValue::Text(t) => t.to_string(),
        NodeValue::Code(c) => format!("`{}`", c.literal),
        NodeValue::HtmlInline(h) => h.clone(),
        NodeValue::Emph => format!("*{}*", alt_text(n)),
        NodeValue::Strong => format!("**{}**", alt_text(n)),
        NodeValue::Strikethrough => format!("~~{}~~", alt_text(n)),
        NodeValue::SoftBreak | NodeValue::LineBreak => "\n".to_string(),
        _ => alt_text(n),
    }).collect()
}

fn checkbox(checked: bool) -> &'static str {
    if checked { "<input checked=\"\" disabled=\"\" type=\"checkbox\"> " } else { "<input disabled=\"\" type=\"checkbox\"> " }
}

fn in_tight_list(node: &AstNode<'_>) -> bool {
    node.parent().and_then(|n| n.parent()).is_some_and(|n| matches!(&n.data().value, NodeValue::List(nl) if nl.tight))
}

/// A loose task item's checkbox goes inside its first paragraph.
fn task_checkbox_in_paragraph(node: &AstNode<'_>) -> Option<bool> {
    let parent = node.parent()?;
    let NodeValue::TaskItem(t) = &parent.data().value else { return None };
    let first = parent.first_child().is_some_and(|f| std::ptr::eq(f, node));
    (first && !in_tight_list(node)).then_some(t.symbol.is_some())
}

create_formatter!(Formatter<Private>, {
    NodeValue::Text(ref t) => |context, entering| {
        if entering { context.write_str(&escape_html(t))?; }
    },
    NodeValue::Code(ref c) => |context, entering| {
        if entering { context.write_str(&format!("<code>{}</code>", escape_html(&c.literal)))?; }
    },
    // HTML5 style: <hr>, not <hr />.
    NodeValue::ThematicBreak => |context, entering| {
        if entering {
            context.cr()?;
            context.write_str("<hr>")?;
            context.lf()?;
        }
    },
    NodeValue::LineBreak => |context, entering| {
        if entering { context.write_str("<br>")?; }
    },
    // Shown as text, without the trailing newline.
    NodeValue::HtmlBlock(ref h) => |context, entering| {
        if entering { context.write_str(&escape_html(h.literal.trim_end_matches('\n')))?; }
    },
    NodeValue::HtmlInline(ref h) => |context, entering| {
        if entering { context.write_str(&escape_html(h))?; }
    },
    NodeValue::Image(_) => |context, node, entering| {
        if entering {
            context.write_str(&escape_html(&alt_text(node)))?;
            return Ok(comrak::html::ChildRendering::Skip);
        }
    },
    NodeValue::Link(ref l) => |context, entering| {
        // An unsafe link shows only its text.
        if SAFE_HREF.is_match(&l.url) {
            if entering {
                context.write_str("<a href=\"")?;
                context.escape_href(&l.url)?;
                context.write_str("\"")?;
                if !l.title.is_empty() {
                    context.write_str(" title=\"")?;
                    context.write_str(&escape_html(&l.title))?;
                    context.write_str("\"")?;
                }
                context.write_str(">")?;
            } else {
                context.write_str("</a>")?;
            }
        }
    },
    NodeValue::Item(_) => |context, node, entering| {
        if entering {
            context.cr()?;
            context.write_str(if context.user.contains(&id(node)) { "<li class=\"private-note\">" } else { "<li>" })?;
        } else {
            context.write_str("</li>")?;
            context.lf()?;
        }
    },
    NodeValue::TaskItem(ref t) => |context, node, entering| {
        if entering {
            context.cr()?;
            context.write_str(if context.user.contains(&id(node)) { "<li class=\"private-note\">" } else { "<li>" })?;
            let loose_first_paragraph = node.first_child().is_some_and(|f| task_checkbox_in_paragraph(f).is_some());
            if !loose_first_paragraph { context.write_str(checkbox(t.symbol.is_some()))?; }
        } else {
            context.write_str("</li>")?;
            context.lf()?;
        }
    },
    NodeValue::Paragraph => |context, node, entering| {
        if !in_tight_list(node) {
            if entering {
                context.cr()?;
                context.write_str(if context.user.contains(&id(node)) { "<p class=\"private-note\">" } else { "<p>" })?;
                if let Some(checked) = task_checkbox_in_paragraph(node) { context.write_str(checkbox(checked))?; }
            } else {
                context.write_str("</p>")?;
                context.lf()?;
            }
        }
    },
});

/// The source text of a block node, from its start position to its end.
fn source_of(lines: &[&str], node: &AstNode<'_>) -> String {
    let sp = node.data().sourcepos;
    let (sl, sc, el, ec) = (sp.start.line, sp.start.column, sp.end.line, sp.end.column);
    if sl == 0 || sl > lines.len() { return String::new(); }
    let mut out = String::new();
    for l in sl..=el.min(lines.len()) {
        let line = lines[l - 1];
        let from = if l == sl { sc.saturating_sub(1).min(line.len()) } else { 0 };
        let to = if l == el { ec.min(line.len()) } else { line.len() };
        if from <= to && line.is_char_boundary(from) && line.is_char_boundary(to) { out.push_str(&line[from..to]); }
        if l != el { out.push('\n'); }
    }
    out
}

static ITEM_MARKER: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\s*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?[ \t]*", ""));
static HEADING_MARKER: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\s*#{1,6}[ \t]*", ""));

/// The text tested for a "Manager-only note": an item without its marker, a heading without its #s.
fn marked_text(lines: &[&str], node: &AstNode<'_>) -> String {
    let src = source_of(lines, node);
    match &node.data().value {
        NodeValue::Item(_) | NodeValue::TaskItem(_) => ITEM_MARKER.replace(&src, "").into_owned(),
        NodeValue::Heading(_) => HEADING_MARKER.replace(&src, "").into_owned(),
        _ => src,
    }
}

fn is_item(node: &AstNode<'_>) -> bool {
    matches!(node.data().value, NodeValue::Item(_) | NodeValue::TaskItem(_))
}

/// Walks the children of a block container. Private items are removed (and counted) or recorded so the
/// formatter can style them.
fn handle_private<'a>(container: &'a AstNode<'a>, lines: &[&str], keep: bool, count: &mut usize, private: &mut Private) {
    let mut skip_depth: u8 = 0;
    let children: Vec<_> = container.children().collect();
    for t in children {
        let heading_level = match &t.data().value { NodeValue::Heading(h) => Some(h.level), _ => None };
        if skip_depth > 0 {
            if heading_level.is_some_and(|d| d <= skip_depth) { skip_depth = 0; } else { t.detach(); continue; }
        }
        if let Some(level) = heading_level {
            if PRIVATE_MARK.is_match(&marked_text(lines, t)) {
                *count += 1;
                if !keep { skip_depth = level; t.detach(); continue; }
            }
        }
        let value_kind = std::mem::discriminant(&t.data().value);
        if value_kind == std::mem::discriminant(&NodeValue::Paragraph) && PRIVATE_MARK.is_match(&marked_text(lines, t)) {
            *count += 1;
            if !keep { t.detach(); continue; }
            private.insert(id(t));
        }
        if matches!(t.data().value, NodeValue::List(_)) {
            let items: Vec<_> = t.children().filter(|n| is_item(n)).collect();
            for item in items {
                if PRIVATE_MARK.is_match(&marked_text(lines, item)) {
                    *count += 1;
                    private.insert(id(item));
                    if !keep { item.detach(); }
                    continue;
                }
                handle_private(item, lines, keep, count, private);
            }
            if t.children().next().is_none() { t.detach(); continue; }
        }
        if matches!(t.data().value, NodeValue::BlockQuote) {
            handle_private(t, lines, keep, count, private);
        }
    }
}

pub struct Rendered {
    pub html: String,
    pub private_notes: usize,
}

pub fn render_markdown(src: &str, show_private: bool) -> Rendered {
    let arena = Arena::new();
    let opts = options();
    let doc = parse_document(&arena, src, &opts);
    let lines: Vec<&str> = src.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
    let mut count = 0;
    let mut private = Private::new();
    handle_private(doc, &lines, show_private, &mut count, &mut private);
    let mut html = String::new();
    Formatter::format_document(doc, &opts, &mut html, private).expect("formatting to a String");
    // Each table fills a block of its own, which scrolls sideways when the table can't fit. Raw HTML in the source
    // is escaped above, so these tags are only ever the formatter's.
    let html = html.replace("<table>", "<div class=\"table-scroll\"><table>").replace("</table>", "</table></div>");
    Rendered { html, private_notes: count }
}

static BLOCK_START: LazyLock<regex::Regex> = LazyLock::new(|| js::re(
    r"^( {0,3})(#{1,6}(?:[ \t]|$)|>|[-+*](?:[ \t]|$)|[0-9]{1,9}[.)](?:[ \t]|$)|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$|(?:-[ \t]*){3,}$|=+[ \t]*$|```|~~~|<|\[[^\]]*\]:)",
    "",
));

/// Inline Markdown only: a line that would start a block (a list, heading,
/// quote, ...) is kept as text.
pub fn render_inline(src: &str) -> String {
    if src.is_empty() { return String::new(); }
    let guarded: Vec<String> = src.split('\n').map(|line| match BLOCK_START.captures(line) {
        Some(c) => {
            let indent = c.get(1).unwrap().as_str();
            let rest = &line[indent.len()..];
            // Escape the first character; a digit can't be escaped, so escape the "." or ")" after it.
            if rest.starts_with(|ch: char| ch.is_ascii_digit()) {
                let n = rest.find(|ch: char| !ch.is_ascii_digit()).unwrap();
                format!("{indent}{}\\{}", &rest[..n], &rest[n..])
            } else {
                format!("{indent}\\{rest}")
            }
        }
        None => line.to_string(),
    }).collect();
    let arena = Arena::new();
    let opts = options();
    let doc = parse_document(&arena, &guarded.join("\n"), &opts);
    let single_paragraph = doc.children().count() == 1 && matches!(doc.first_child().unwrap().data().value, NodeValue::Paragraph);
    if !single_paragraph { return escape_html(src); }
    let mut html = String::new();
    Formatter::format_document(doc, &opts, &mut html, Private::new()).expect("formatting to a String");
    html.strip_prefix("<p>").and_then(|h| h.strip_suffix("</p>\n")).map(str::to_string).unwrap_or(html)
}

static PT_LINK: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\[([^\]]*)\]\([^)]*\)", ""));
static PT_MARKS: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"(\*\*|__|\*|`)", ""));
static PT_UNDERSCORE: LazyLock<fancy_regex::Regex> = LazyLock::new(|| js::fre(r"(^|\s)_(\S[^_]*\S|\S)_(?=\s|$|[.,;:])", ""));
static PT_SPACE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"\s+", ""));

/// Plain text from inline Markdown: drop emphasis, code ticks and link targets.
pub fn plain_text(src: &str) -> String {
    let s = PT_LINK.replace_all(src, "${1}");
    let s = PT_MARKS.replace_all(&s, "");
    let s = PT_UNDERSCORE.replace_all(&s, "${1}${2}");
    let s = PT_SPACE.replace_all(&s, " ");
    js::trim(&s).to_string()
}

pub fn split_lines(src: &str) -> Vec<&str> {
    src.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect()
}

static H2: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^##\s+", ""));
static H12: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^#{1,2}\s+", ""));

/// The lines of a "## Heading" section, up to the next level-2 (or higher) heading.
pub fn section_lines<'a>(src: &'a str, heading: &str) -> Option<Vec<&'a str>> {
    let lines = split_lines(src);
    let want = heading.to_lowercase();
    let start = lines.iter().position(|l| H2.is_match(l) && js::trim(&H2.replace(l, "")).to_lowercase() == want)?;
    let end = lines.iter().enumerate().position(|(i, l)| i > start && H12.is_match(l)).unwrap_or(lines.len());
    Some(lines[start + 1..end].to_vec())
}

fn split_row(line: &str) -> Vec<String> {
    let t = js::trim(line);
    let t = t.strip_prefix('|').unwrap_or(t);
    let body = t.strip_suffix('|').unwrap_or(t);
    let mut cells = Vec::new();
    let mut cur = String::new();
    let mut in_code = false;
    let mut chars = body.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' && chars.peek() == Some(&'|') { cur.push('|'); chars.next(); continue; }
        if c == '`' { in_code = !in_code; }
        if c == '|' && !in_code { cells.push(js::trim(&cur).to_string()); cur.clear(); continue; }
        cur.push(c);
    }
    cells.push(js::trim(&cur).to_string());
    cells
}

pub struct Table {
    pub header: Vec<String>,
    pub rows: Vec<Row>,
    pub bad: Vec<String>,
}

/// A table row by column name. A repeated column name keeps the last cell, as Object.fromEntries did.
pub struct Row(Vec<(String, String)>);

impl Row {
    pub fn get(&self, name: &str) -> Option<&str> {
        self.0.iter().rev().find(|(h, _)| h == name).map(|(_, v)| v.as_str())
    }
}

static DELIM_ROW: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\|?\s*:?-{2,}", ""));

/// Parses the first pipe table in a section. Rows whose cell count doesn't match the header are
/// reported in `bad` rather than guessed at.
pub fn parse_table(lines: &[&str]) -> Option<Table> {
    let mut table_lines = Vec::new();
    for l in lines {
        if js::trim(l).starts_with('|') { table_lines.push(*l); } else if !table_lines.is_empty() { break; }
    }
    if table_lines.len() < 2 || !DELIM_ROW.is_match(js::trim(table_lines[1])) { return None; }
    let header = split_row(table_lines[0]);
    let mut rows = Vec::new();
    let mut bad = Vec::new();
    for l in &table_lines[2..] {
        let cells = split_row(l);
        if cells.len() != header.len() { bad.push(l.to_string()); continue; }
        rows.push(Row(header.iter().cloned().zip(cells).collect()));
    }
    Some(Table { header, rows, bad })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn raw_html_and_scripts_are_escaped() {
        let r = render_markdown("<script>alert(1)</script>\n\nHi <b onclick=\"x()\">there</b>\n\n<div>\nblock\n</div>\n", false);
        assert!(!r.html.contains("<script"), "{}", r.html);
        assert!(!r.html.contains("<b "), "{}", r.html);
        assert!(!r.html.contains("<div"), "{}", r.html);
        assert!(r.html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"), "{}", r.html);
    }

    #[test]
    fn unsafe_links_and_images_become_text() {
        let r = render_markdown("[x](javascript:alert(1)) [ok](https://example.com) ![alt <b>](http://img/x.png)", false);
        assert!(!r.html.contains("javascript"), "{}", r.html);
        assert!(r.html.contains("<a href=\"https://example.com\">ok</a>"), "{}", r.html);
        assert!(!r.html.contains("<img"), "{}", r.html);
    }

    #[test]
    fn private_notes_are_removed_or_flagged() {
        let src = "- a\n- **Manager-only note:** secret\n\n## Manager-only note\n\nhidden\n\n## Next\n\nshown\n";
        let off = render_markdown(src, false);
        assert_eq!(off.private_notes, 2);
        assert!(!off.html.contains("secret") && !off.html.contains("hidden") && off.html.contains("shown"), "{}", off.html);
        let on = render_markdown(src, true);
        assert!(on.html.contains("<li class=\"private-note\">"), "{}", on.html);
        assert!(on.html.contains("hidden"));
    }

    #[test]
    fn inline_keeps_block_syntax_as_text() {
        assert_eq!(render_inline("1. first"), "1. first");
        assert_eq!(render_inline("# not a heading"), "# not a heading");
        assert_eq!(render_inline("**bold** <i>x</i>"), "<strong>bold</strong> &lt;i&gt;x&lt;/i&gt;");
    }

    #[test]
    fn plain_text_drops_marks() {
        assert_eq!(plain_text("**Ask** [Dana](x.md) for _two_ `weeks`"), "Ask Dana for two weeks");
    }
}
