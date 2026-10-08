// JavaScript behaviours the core keeps, so the files are read the way the pages and tests expect:
// regular expressions with JS meanings of \s \w \d \b and ".", String.prototype.trim, string length in
// UTF-16 units, Number(), String(), localeCompare and Date.parse for "YYYY-MM-DD".
use std::cmp::Ordering;

use chrono::NaiveDate;
use serde_json::Value;

// JS whitespace (WhiteSpace + LineTerminator), as used by \s and trim().
const WS: &str = "\t\n\u{0B}\u{0C}\r \u{A0}\u{1680}\u{2000}-\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}";

pub fn is_ws(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'..='\u{200A}'
        | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}')
}

pub fn trim(s: &str) -> &str {
    s.trim_matches(is_ws)
}

/// Translates a JS regular expression into Rust syntax with the same meaning.
fn translate(pattern: &str, flags: &str, fancy: bool) -> String {
    let mut out = String::new();
    if flags.contains('i') { out.push_str("(?i)"); }
    if flags.contains('m') { out.push_str("(?mR)"); }
    let dot_all = flags.contains('s');
    let mut in_class = false;
    let mut chars = pattern.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                let n = chars.next().expect("dangling escape");
                match (n, in_class) {
                    ('s', false) => { out.push('['); out.push_str(WS); out.push(']'); }
                    ('S', false) => { out.push_str("[^"); out.push_str(WS); out.push(']'); }
                    ('w', false) => out.push_str("[0-9A-Za-z_]"),
                    ('W', false) => out.push_str("[^0-9A-Za-z_]"),
                    ('d', false) => out.push_str("[0-9]"),
                    ('D', false) => out.push_str("[^0-9]"),
                    ('b', false) => { assert!(!fancy, "use \\b only with the plain engine"); out.push_str("(?-u:\\b)"); }
                    ('B', false) => { assert!(!fancy, "use \\B only with the plain engine"); out.push_str("(?-u:\\B)"); }
                    ('s', true) => out.push_str(WS),
                    ('w', true) => out.push_str("0-9A-Za-z_"),
                    ('d', true) => out.push_str("0-9"),
                    // Negated sets inside a class become nested classes, which only the plain engine reads.
                    ('S', true) => { assert!(!fancy, "use [\\S] only with the plain engine"); out.push_str("[^"); out.push_str(WS); out.push(']'); }
                    ('W', true) => { assert!(!fancy, "use [\\W] only with the plain engine"); out.push_str("[^0-9A-Za-z_]"); }
                    ('D', true) => { assert!(!fancy, "use [\\D] only with the plain engine"); out.push_str("[^0-9]"); }
                    ('b' | 'B', true) => panic!("unsupported escape \\{n} inside a class"),
                    ('/', _) => out.push('/'),
                    _ => { out.push('\\'); out.push(n); }
                }
            }
            '[' if !in_class => {
                in_class = true;
                out.push('[');
                if chars.peek() == Some(&'^') { out.push(chars.next().unwrap()); }
                // A "]" right after "[" or "[^" is literal in Rust but ends an empty class in JS; not used here.
            }
            ']' if in_class => { in_class = false; out.push(']'); }
            // Characters Rust treats as class syntax but JS treats as literals.
            '[' | '&' | '~' if in_class => { out.push('\\'); out.push(c); }
            '.' if !in_class && !dot_all => out.push_str("[^\n\r\u{2028}\u{2029}]"),
            _ => out.push(c),
        }
    }
    out
}

pub fn re(pattern: &str, flags: &str) -> regex::Regex {
    regex::Regex::new(&translate(pattern, flags, false)).unwrap_or_else(|e| panic!("bad regex {pattern}: {e}"))
}

pub fn fre(pattern: &str, flags: &str) -> fancy_regex::Regex {
    fancy_regex::Regex::new(&translate(pattern, flags, true)).unwrap_or_else(|e| panic!("bad regex {pattern}: {e}"))
}

/// String length as JS counts it (UTF-16 code units).
pub fn len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// s.slice(0, n) in UTF-16 units, never splitting a character.
pub fn slice_to(s: &str, n: usize) -> &str {
    let mut units = 0;
    for (i, c) in s.char_indices() {
        units += c.len_utf16();
        if units > n { return &s[..i]; }
    }
    s
}

/// Default Array.prototype.sort order for strings (UTF-16 code units).
pub fn cmp_utf16(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// String(value) for a JSON value; `None` is undefined.
pub fn string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => number_to_string(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(a)) => a.iter().map(|x| match x {
            Value::Null => String::new(),
            other => string(Some(other)),
        }).collect::<Vec<_>>().join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

/// JSON.stringify(value) for a message; `None` is undefined.
pub fn stringify(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(v) => serde_json::to_string(&normalize_numbers(v.clone())).unwrap(),
    }
}

/// Truthiness of a JSON value; `None` is undefined.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

pub fn is_integer(v: &Value) -> bool {
    match v {
        Value::Number(n) => n.is_i64() || n.is_u64() || n.as_f64().is_some_and(|f| f.is_finite() && f.fract() == 0.0),
        _ => false,
    }
}

/// Number.prototype.toString().
pub fn number_to_string(x: f64) -> String {
    if x.is_nan() { return "NaN".into(); }
    if x.is_infinite() { return if x > 0.0 { "Infinity".into() } else { "-Infinity".into() }; }
    if x == 0.0 { return "0".into(); }
    let sign = if x < 0.0 { "-" } else { "" };
    let e = format!("{:e}", x.abs()); // shortest round-trip digits, e.g. "1.5e300"
    let (mant, exp) = e.split_once('e').unwrap();
    let digits: String = mant.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exp.parse::<i32>().unwrap() + 1;
    let body = if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let rest = if k > 1 { format!(".{}", &digits[1..]) } else { String::new() };
        format!("{}{rest}e{}{}", &digits[..1], if n > 0 { "+" } else { "-" }, (n - 1).abs())
    };
    format!("{sign}{body}")
}

/// Number(string): the StringToNumber grammar.
pub fn string_to_number(s: &str) -> f64 {
    let t = trim(s);
    if t.is_empty() { return 0.0; }
    for (prefix, radix) in [("0x", 16), ("0X", 16), ("0o", 8), ("0O", 8), ("0b", 2), ("0B", 2)] {
        if let Some(rest) = t.strip_prefix(prefix) {
            if rest.is_empty() || !rest.chars().all(|c| c.is_digit(radix)) { return f64::NAN; }
            return rest.chars().fold(0.0, |acc, c| acc * radix as f64 + c.to_digit(radix).unwrap() as f64);
        }
    }
    let unsigned = t.strip_prefix(['+', '-']).unwrap_or(t);
    if unsigned == "Infinity" { return if t.starts_with('-') { f64::NEG_INFINITY } else { f64::INFINITY }; }
    // Decimal literal: digits, optional fraction, optional exponent. Rust's parser would also accept
    // "inf" and "nan", which JS does not.
    let ok = {
        let b = unsigned.as_bytes();
        let mut i = 0;
        let int_start = i;
        while i < b.len() && b[i].is_ascii_digit() { i += 1; }
        let mut digits = i > int_start;
        if i < b.len() && b[i] == b'.' {
            i += 1;
            let f = i;
            while i < b.len() && b[i].is_ascii_digit() { i += 1; }
            digits |= i > f;
        }
        if digits && i < b.len() && (b[i] == b'e' || b[i] == b'E') {
            i += 1;
            if i < b.len() && (b[i] == b'+' || b[i] == b'-') { i += 1; }
            let e = i;
            while i < b.len() && b[i].is_ascii_digit() { i += 1; }
            if i == e { return f64::NAN; }
        }
        digits && i == b.len()
    };
    if !ok { return f64::NAN; }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// Writes numbers the way JSON.stringify does: 4.0 as 4 and -0 as 0.
pub fn normalize_numbers(v: Value) -> Value {
    match v {
        Value::Number(n) if !(n.is_i64() || n.is_u64()) => {
            let f = n.as_f64().unwrap();
            if f.fract() == 0.0 && f.abs() < 9.007_199_254_740_992e15 { Value::from(f as i64) } else { Value::Number(n) }
        }
        Value::Array(a) => Value::Array(a.into_iter().map(normalize_numbers).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, normalize_numbers(v))).collect()),
        other => other,
    }
}

// ---------- dates ----------

/// Days since 1970-01-01 for a real calendar date "YYYY-MM-DD". An impossible date such as Feb 30 is
/// None, never rolled over to March.
pub fn date_days(s: &str) -> Option<i64> {
    if !is_real_date(s) { return None; }
    let d = NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()?;
    Some((d - NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()).num_days())
}

/// A real calendar date "YYYY-MM-DD" (Date.parse succeeds and toISOString gives the same day back).
pub fn is_real_date(s: &str) -> bool {
    s.len() == 10 && NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok_and(|d| d.format("%Y-%m-%d").to_string() == s)
}

// ---------- localeCompare ----------

// ICU root collation order for printable ASCII, as JavaScript's Intl gives it. Letters share a primary weight
// with their capital (lowercase first at the tertiary level). Characters outside ASCII sort after,
// by code point: an approximation, used only to break ties between ASCII file names and keys.
const ICU_ORDER: &str = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyz";

#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum Primary {
    Char(u32),
    Number(usize, String), // digit count without leading zeros, then the digits
}

fn primary_of(c: char) -> u32 {
    let lower = c.to_ascii_lowercase();
    match ICU_ORDER.find(lower) {
        Some(i) if c.is_ascii() => i as u32,
        _ => 1000 + c as u32,
    }
}

fn keys(s: &str, numeric: bool) -> (Vec<Primary>, Vec<u8>) {
    let mut primary = Vec::new();
    let mut tertiary = Vec::new();
    let chars: Vec<char> = s.chars().filter(|c| !c.is_ascii_control()).collect();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if numeric && c.is_ascii_digit() {
            let start = i;
            while i < chars.len() && chars[i].is_ascii_digit() { i += 1; }
            let run: String = chars[start..i].iter().collect();
            let stripped = run.trim_start_matches('0');
            let digits = if stripped.is_empty() { "0" } else { stripped };
            primary.push(Primary::Number(digits.len(), digits.to_string()));
            tertiary.push(0);
            continue;
        }
        primary.push(Primary::Char(primary_of(c)));
        tertiary.push(u8::from(c.is_ascii_uppercase()));
        i += 1;
    }
    (primary, tertiary)
}

fn cmp_primary(a: &Primary, b: &Primary) -> Ordering {
    // A number sorts where its digits would: between "$" and "a".
    let digit_weight = primary_of('0');
    match (a, b) {
        (Primary::Number(..), Primary::Char(c)) => digit_weight.cmp(c).then(Ordering::Greater),
        (Primary::Char(c), Primary::Number(..)) => c.cmp(&digit_weight).then(Ordering::Less),
        _ => a.cmp(b),
    }
}

pub fn locale_compare(a: &str, b: &str, numeric: bool) -> Ordering {
    let (pa, ta) = keys(a, numeric);
    let (pb, tb) = keys(b, numeric);
    for (x, y) in pa.iter().zip(pb.iter()) {
        let o = cmp_primary(x, y);
        if o != Ordering::Equal { return o; }
    }
    pa.len().cmp(&pb.len()).then_with(|| ta.cmp(&tb))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbers_print_like_js() {
        for (x, s) in [(1.0, "1"), (0.1, "0.1"), (1e21, "1e+21"), (1e-7, "1e-7"), (123.456, "123.456"), (-0.0, "0"), (1.5e300, "1.5e+300"), (0.000001, "0.000001")] {
            assert_eq!(number_to_string(x), s);
        }
    }

    #[test]
    fn number_parses_like_js() {
        assert_eq!(string_to_number("0x4"), 4.0);
        assert_eq!(string_to_number(" 4 "), 4.0);
        assert_eq!(string_to_number("4.0"), 4.0);
        assert_eq!(string_to_number(""), 0.0);
        assert!(string_to_number("inf").is_nan());
        assert!(string_to_number("4px").is_nan());
        assert_eq!(string_to_number("-Infinity"), f64::NEG_INFINITY);
    }

    #[test]
    fn impossible_dates_are_refused() {
        assert_eq!(date_days("1970-01-02"), Some(1));
        assert_eq!(date_days("2026-02-30"), None);
        assert_eq!(date_days("2026-01-32"), None);
        assert_eq!(date_days("2026-13-01"), None);
        assert!(is_real_date("2024-02-29"));
        assert!(!is_real_date("2026-02-29"));
    }

    #[test]
    fn locale_compare_matches_icu() {
        let mut v = vec!["a", "B", "b", "A", "a-b", "a_b", "ab", "a.b"];
        v.sort_by(|a, b| locale_compare(a, b, false));
        assert_eq!(v, ["a", "A", "a_b", "a-b", "a.b", "ab", "b", "B"]);
        let mut k = vec!["x#10", "x#3", "x#open-1", "x#open-10", "x#open-2"];
        k.sort_by(|a, b| locale_compare(a, b, true));
        assert_eq!(k, ["x#3", "x#10", "x#open-1", "x#open-2", "x#open-10"]);
    }

    #[test]
    fn regex_classes_are_ascii_like_js() {
        assert!(!re(r"^[\w.-]+\.md$", "").is_match("café.md"));
        assert!(re(r"^\s+$", "").is_match("\u{FEFF}"));
        assert!(re(r"x\b", "").is_match("xé"));
        assert!(re(r"^a.c$", "").is_match("abc"));
        assert!(!re(r"^a.c$", "").is_match("a\rc"));
        assert!(re(r"^[\s\S]*$", "").is_match("any\nthing"));
    }

    #[test]
    fn every_pattern_in_the_core_compiles() {
        // Statics compile on first use; touch each module's code paths on a sample workspace instead
        // of waiting for a request to find a bad pattern.
        let dir = std::env::temp_dir().join(format!("mc-core-regex-{}", std::process::id()));
        std::fs::create_dir_all(dir.join(".claude/agents")).unwrap();
        std::fs::create_dir_all(dir.join("meeting-notes")).unwrap();
        std::fs::create_dir_all(dir.join("library")).unwrap();
        std::fs::write(dir.join("CLAUDE.md"), "---\nname: x\n---\nPurpose: p\nSources: library/a.md\nLast reviewed: 2026-01-01\n\n1. rule\n").unwrap();
        std::fs::write(dir.join(".claude/agents/a.md"), "Purpose: p\n").unwrap();
        std::fs::write(dir.join("meeting-notes/2026-01-01_a.md"), "# T\n\n**Date:** Jan 1, 2026 | **Type:** 1:1\n\n## Action Items\n\n| # | Action Item | Owner | Status |\n|---|---|---|---|\n| 1 | Do _it_ (suggested) | A and B | Open |\n").unwrap();
        std::fs::write(dir.join("library/books.json"), "[]").unwrap();
        let ws = crate::Workspace::new(&dir);
        crate::agents::load_agents(&ws).unwrap();
        crate::meetings::meetings_overview(&ws, true).unwrap();
        crate::library::library_view(&ws).unwrap();
        let _ = crate::markdown::render_markdown("x", false);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
