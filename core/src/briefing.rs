// The briefing on Today: tiles, team health, the coach's reflections, the week's numbers and six weeks of activity.
// It is worked out from the same items, people facts and summaries as the rest of Today, and only reads. A week runs
// Monday to Sunday; "this week" holds the as-of date and its counts stop there, "last week" is the one before. The
// tiles, team health, your overdue items and coverage are always as of the as-of date, whichever week is picked.
// No note between meetings and no Manager-only note appears in any of it.
use chrono::{Datelike, Duration, NaiveDate};
use serde_json::{json, Value};

use crate::board::Board;
use crate::markdown::{list_items, section_lines, Runs};
use crate::meetings::days_between;
use crate::people::People;
use crate::paths::Workspace;
use crate::today::{facts, Item};
use crate::{js, Error};

/// Weeks in the activity chart, ending with this week.
const ACTIVITY_WEEKS: i64 = 6;
/// A report is covered by a meeting with me at most this many days before the as-of date.
const COVERAGE_DAYS: i64 = 14;
/// "Over 30 days" past due.
const LONG_OVERDUE_DAYS: i64 = 30;
/// The coach's labels under "Other Insights", and the kind each gives a reflection.
const REFLECTIONS: [(&str, &str); 2] = [("What went well:", "went-well"), ("Could do better:", "could-do-better")];

#[derive(Clone, Copy, PartialEq)]
pub enum Week {
    This,
    Last,
}

impl Week {
    /// ?week=this|last; this week when it is not given.
    pub fn parse(param: Option<&str>) -> Result<Week, Error> {
        match param {
            None | Some("this") => Ok(Week::This),
            Some("last") => Ok(Week::Last),
            Some(_) => Err(Error::Status(400, "Ask for week=this or week=last".into())),
        }
    }

    fn name(self) -> &'static str {
        if self == Week::This { "this" } else { "last" }
    }
}

fn date(d: &str) -> NaiveDate {
    NaiveDate::parse_from_str(d, "%Y-%m-%d").expect("the as-of date is a real date")
}

fn iso(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

/// A span of days, both ends included, as YYYY-MM-DD.
struct Span {
    from: String,
    to: String,
}

impl Span {
    fn holds(&self, d: Option<&str>) -> bool {
        d.is_some_and(|d| d >= self.from.as_str() && d <= self.to.as_str())
    }
}

/// The days of a week counted so far: Monday to Sunday, or to the as-of date if that comes first.
fn counted(monday: NaiveDate, as_of: &str) -> Span {
    let sunday = iso(monday + Duration::days(6));
    Span { from: iso(monday), to: if as_of < sunday.as_str() { as_of.to_string() } else { sunday } }
}

fn due<'i>(i: &'i Item) -> Option<&'i str> {
    i.card.json["dueDate"].as_str()
}

fn closed<'i>(i: &'i Item) -> Option<&'i str> {
    i.card.json["closed"].as_str()
}

/// Open and past due on day `d`, told from its close date: an item closed after `d` was still open then. One in Done
/// with no close date counts as closed. An item first seen after `d` was not there yet.
fn overdue_on(i: &Item, d: &str) -> bool {
    let open_then = i.open() || closed(i).is_some_and(|c| c > d);
    open_then && due(i).is_some_and(|x| x < d) && i.since.is_none_or(|s| s <= d)
}

fn x_of_y(x: usize, y: usize) -> String {
    format!("{x} of {y}")
}

/// A reflection from a list item's runs: its kind, its headline (the bold words after the label, else the first
/// sentence) and the text after the label, words unchanged. None when the item doesn't start with a label.
fn reflection(runs: &Runs) -> Option<(&'static str, String, String)> {
    // The item's text with each stretch of white space as one space, and which of its bytes are bold.
    let (mut text, mut bold) = (String::new(), Vec::new());
    for (part, b) in runs {
        for c in part.chars() {
            let c = if c.is_whitespace() { ' ' } else { c };
            if c == ' ' && (text.is_empty() || text.ends_with(' ')) { continue; }
            text.push(c);
            bold.extend(std::iter::repeat_n(*b, c.len_utf8()));
        }
    }
    let end = text.trim_end().len();
    let (text, bold) = (&text[..end], &bold[..end]);
    let (label, kind) = REFLECTIONS.iter().find(|(l, _)| text.get(..l.len()).is_some_and(|t| t.eq_ignore_ascii_case(l)))?;
    let start = label.len() + text[label.len()..].len() - text[label.len()..].trim_start().len();
    let rest = &text[start..];
    if rest.is_empty() { return None; }
    let headline = if bold[start] {
        let to = bold[start..].iter().position(|b| !b).map_or(text.len(), |n| start + n);
        text[start..to].trim().to_string()
    } else {
        String::new()
    };
    let headline = if headline.is_empty() { first_sentence(rest).to_string() } else { headline };
    Some((kind, headline, rest.to_string()))
}

/// Up to the first ".", "!" or "?" (with any closing quote or bracket after it) that ends the text or comes before a space.
fn first_sentence(s: &str) -> &str {
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    for (k, &(_, c)) in chars.iter().enumerate() {
        if !matches!(c, '.' | '!' | '?') { continue; }
        let mut j = k + 1;
        while chars.get(j).is_some_and(|&(_, c)| matches!(c, '"' | '\'' | '”' | '’' | ')' | ']')) { j += 1; }
        match chars.get(j) {
            None => return s,
            Some(&(at, ' ')) => return &s[..at],
            _ => {}
        }
    }
    s
}

/// The reflections in the summaries dated in `span`, oldest meeting first, each in the order the summary lists them.
fn reflections(ws: &Workspace, b: &Board, span: &Span) -> Result<Vec<Value>, Error> {
    let mut meetings: Vec<_> = b.ov.meetings.iter().filter(|m| span.holds(m.date.as_deref())).collect();
    meetings.reverse();
    let mut out = Vec::new();
    for m in meetings {
        let src = ws.read_text(&format!("meeting-notes/{}", m.file))?;
        let Some(lines) = section_lines(&src, "Other Insights") else { continue };
        for runs in list_items(&lines.join("\n")) {
            if let Some((kind, headline, text)) = reflection(&runs) {
                out.push(json!({ "kind": kind, "headline": headline, "text": text, "file": m.file, "date": m.date }));
            }
        }
    }
    Ok(out)
}

/// The briefing for `week`. `me` is None when people.md doesn't say who I am: whose an item is, and the meetings
/// with me, can't be told, so what depends on them is null.
pub(crate) fn build(ws: &Workspace, b: &Board, people: &People, me: Option<&str>, all: &[Item], confirm: usize, week: Week) -> Result<Value, Error> {
    let as_of = b.ov.as_of.as_str();
    let today = date(as_of);
    let this_monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
    let friday = iso(this_monday + Duration::days(4));
    let this_week = counted(this_monday, as_of);
    let last_week = counted(this_monday - Duration::days(7), as_of);
    let (picked, other) = if week == Week::This { (&this_week, &last_week) } else { (&last_week, &this_week) };

    let open: Vec<&Item> = all.iter().filter(|i| i.open()).collect();
    let past_due: Vec<&Item> = open.iter().copied().filter(|i| due(i).is_some_and(|d| d < as_of)).collect();
    let days_late = |i: &Item| due(i).and_then(|d| days_between(d, as_of)).unwrap_or(0);
    let closed_in = |span: &Span| all.iter().filter(|i| !i.open() && span.holds(closed(i))).collect::<Vec<_>>();

    // Due this week: from the as-of date to Friday; then the first due date after that, and how many share it.
    let this_week_due = open.iter().filter(|i| due(i).is_some_and(|d| d >= as_of && d <= friday.as_str())).count();
    let next = open.iter().filter_map(|i| due(i)).filter(|d| *d > friday.as_str()).min();
    let next = next.map(|n| json!({ "date": n, "count": open.iter().filter(|i| due(i) == Some(n)).count() }));

    // The reports, in people.md order, with what Today says about each.
    let reports: Option<Vec<_>> = me.map(|me| people.people.iter()
        .filter(|p| p.relationship.eq_ignore_ascii_case("report"))
        .map(|p| (p.name.as_str(), facts(b, people, me, all, p)))
        .collect());
    let flagged = |rules: &[&str]| reports.as_ref().map(|rs| {
        let names: Vec<&str> = rs.iter()
            .filter(|(_, f)| f.flags.iter().any(|x| rules.is_empty() || rules.contains(&x["rule"].as_str().unwrap_or(""))))
            .map(|(n, _)| *n).collect();
        json!({ "count": names.len(), "names": names })
    });
    let missed = reports.as_ref().map(|rs| {
        let mut m = flagged(&["no-meeting", "no-meeting-yet"]).unwrap();
        // The longest time since a report's last meeting with me; the first in people.md on a tie.
        let longest = rs.iter().filter_map(|(n, f)| Some((*n, f.days_since?))).fold(None, |best: Option<(&str, i64)>, x| match best {
            Some(b) if b.1 >= x.1 => Some(b),
            _ => Some(x),
        });
        m["longestGap"] = longest.map_or(Value::Null, |(name, days)| json!({ "name": name, "days": days }));
        m
    });
    let owed = me.map(|_| {
        let mut list: Vec<&&Item> = past_due.iter().filter(|i| !i.mine).collect();
        list.sort_by(|a, b| days_late(b).cmp(&days_late(a)).then_with(|| js::locale_compare(&a.card.id, &b.card.id, true)));
        let items: Vec<Value> = list.iter().map(|i| json!({
            "id": i.card.id, "title": i.card.json["title"], "owner": i.owner, "due": due(i), "daysPastDue": days_late(i),
        })).collect();
        json!({ "count": items.len(), "items": items })
    });

    let closed_now = closed_in(picked);
    let with_due: Vec<&&Item> = closed_now.iter().filter(|i| due(i).is_some()).collect();
    let on_time = with_due.iter().filter(|i| closed(i).zip(due(i)).is_some_and(|(c, d)| c <= d)).count();
    let coverage = reports.as_ref().map(|rs| {
        let met = rs.iter().filter(|(_, f)| f.days_since.is_some_and(|d| d <= COVERAGE_DAYS)).count();
        x_of_y(met, rs.len())
    });

    let activity: Vec<Value> = (0..ACTIVITY_WEEKS).rev().map(|back| {
        let span = counted(this_monday - Duration::days(7 * back), as_of);
        json!({
            "weekStart": span.from,
            "created": all.iter().filter(|i| span.holds(i.card.json["meetingDate"].as_str())).count(),
            "completed": closed_in(&span).len(),
            "overdue": all.iter().filter(|i| overdue_on(i, &span.to)).count(),
        })
    }).collect();

    Ok(json!({
        "week": week.name(),
        "weekStart": picked.from,
        "weekEnd": iso(date(&picked.from) + Duration::days(6)),
        "countedTo": picked.to,
        "tiles": {
            "dueToday": open.iter().filter(|i| due(i) == Some(as_of)).count(),
            "overdue": { "count": past_due.len(), "overThirtyDays": past_due.iter().filter(|i| days_late(i) > LONG_OVERDUE_DAYS).count() },
            "dueThisWeek": { "count": this_week_due, "through": friday, "next": next },
            "completed": { "count": closed_now.len(), "otherWeek": closed_in(other).len() },
            "teamAlerts": flagged(&[]),
        },
        "teamHealth": {
            "heavyLoads": flagged(&["busy-week"]),
            "overdueOwedToYou": owed,
            "missedOneOnOne": missed,
            "awaitingInput": confirm,
        },
        "reflections": reflections(ws, b, picked)?,
        "numbers": {
            "closed": closed_now.len(),
            "closedOnTime": x_of_y(on_time, with_due.len()),
            "yourOverdue": me.map(|_| past_due.iter().filter(|i| i.mine).count()),
            "coverage": coverage,
        },
        "activity": activity,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn runs(src: &str) -> Vec<Runs> {
        list_items(src)
    }

    #[test]
    fn the_headline_is_the_bold_words_after_the_label_or_the_first_sentence() {
        let items = runs(concat!(
            "- **What went well: wins before asks.** Then the rest.\n",
            "- What went well: **asked first.** Then listened.\n",
            "- **Could do better:** no bold here. Second sentence.\n",
            "- Could do better: plain \"quoted.\" And more\n",
            "- Pattern worth watching: not a reflection.\n",
        ));
        let got: Vec<_> = items.iter().filter_map(reflection).collect();
        assert_eq!(got, vec![
            ("went-well", "wins before asks.".to_string(), "wins before asks. Then the rest.".to_string()),
            ("went-well", "asked first.".to_string(), "asked first. Then listened.".to_string()),
            ("could-do-better", "no bold here.".to_string(), "no bold here. Second sentence.".to_string()),
            ("could-do-better", "plain \"quoted.\"".to_string(), "plain \"quoted.\" And more".to_string()),
        ]);
    }

    #[test]
    fn nothing_inside_a_manager_only_note_is_a_reflection() {
        let items = runs(concat!(
            "- **Manager-only note:** What went well: private.\n",
            "- **Manager-only note:** see below.\n",
            "  - What went well: nested and private.\n",
            "- What went well: shown.\n",
            "\n### Manager-only note\n\n- Could do better: under a private heading.\n",
        ));
        let got: Vec<_> = items.iter().filter_map(reflection).map(|r| r.2).collect();
        assert_eq!(got, vec!["shown.".to_string()]);
    }

    #[test]
    fn weeks_run_monday_to_sunday_and_stop_at_the_as_of_date() {
        let tuesday = date("2026-09-22");
        let monday = tuesday - Duration::days(tuesday.weekday().num_days_from_monday() as i64);
        assert_eq!(iso(monday), "2026-09-21");
        let span = counted(monday, "2026-09-22");
        assert_eq!((span.from.as_str(), span.to.as_str()), ("2026-09-21", "2026-09-22"));
        let last = counted(monday - Duration::days(7), "2026-09-22");
        assert_eq!((last.from.as_str(), last.to.as_str()), ("2026-09-14", "2026-09-20"));
    }
}
