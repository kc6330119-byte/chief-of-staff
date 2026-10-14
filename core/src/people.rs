// people.md in the workspace root: who is who. Owners on the Meetings page are checked against it, and a
// name in its "Also called" column stands for the Name. The app reads it and never writes it.
use std::collections::HashMap;

use crate::markdown::{parse_table, plain_text, split_lines};
use crate::meetings::COULD_NOT_READ;
use crate::paths::Workspace;
use crate::{js, Error, Warning};

pub const FILE: &str = "people.md";
pub const COLUMNS: [&str; 4] = ["Name", "Role", "Relationship", "Also called"];
const RELATIONSHIPS: [&str; 5] = ["me", "report", "manager", "peer", "other"];

pub struct Person {
    pub name: String,
    pub role: String,
    pub relationship: String,
    pub also_called: Vec<String>,
}

pub struct People {
    pub found: bool,
    pub people: Vec<Person>,
    pub warnings: Vec<Warning>,
}

impl People {
    /// The Name that a written name stands for: the Name itself, or one of its "Also called" names.
    pub fn resolve(&self, written: &str) -> Option<&str> {
        let w = js::trim(written);
        if w.is_empty() { return None; }
        self.people.iter().find(|p| p.name == w || p.also_called.iter().any(|a| a == w)).map(|p| p.name.as_str())
    }
}

fn cell(r: &crate::markdown::Row, name: &str) -> String {
    js::trim(&plain_text(r.get(name).unwrap_or(""))).to_string()
}

pub fn load_people(ws: &Workspace) -> Result<People, Error> {
    if !ws.exists(FILE)? { return Ok(People { found: false, people: Vec::new(), warnings: Vec::new() }); }
    let src = ws.read_text(FILE)?;
    let mut warnings = Vec::new();
    let mut warn = |w: Warning| warnings.push(w);
    let mut people = Vec::new();
    match parse_table(&split_lines(&src)) {
        None => warn(Warning::new(FILE, format!("the table {COULD_NOT_READ}"))),
        Some(table) => {
            let missing: Vec<&str> = COLUMNS.into_iter().filter(|h| !table.header.iter().any(|x| x == h)).collect();
            if !missing.is_empty() {
                warn(Warning::new(FILE, format!("the table {COULD_NOT_READ}: missing column {}", missing.join(", "))));
            } else {
                for l in &table.bad { warn(Warning::varied(FILE, &format!("row {COULD_NOT_READ}: {{}}…"), &[js::slice_to(l, 80)])); }
                for r in &table.rows {
                    let name = cell(r, "Name");
                    if name.is_empty() { warn(Warning::new(FILE, "a row has no Name")); continue; }
                    let relationship = cell(r, "Relationship");
                    if !RELATIONSHIPS.contains(&relationship.to_lowercase().as_str()) {
                        warn(Warning::varied(FILE, &format!("the relationship \"{{}}\" of {{}} is not one of {}", RELATIONSHIPS.join(", ")), &[&relationship, &name]));
                    }
                    let also_called = cell(r, "Also called").split(',').map(|a| js::trim(a).to_string()).filter(|a| !a.is_empty()).collect();
                    people.push(Person { name, role: cell(r, "Role"), relationship, also_called });
                }
            }
        }
    }
    // A name that stands for two people can't say who owns an item.
    let mut seen: HashMap<&str, &str> = HashMap::new();
    for p in &people {
        for n in std::iter::once(&p.name).chain(&p.also_called) {
            match seen.get(n.as_str()) {
                Some(other) if *other != p.name => warn(Warning::varied(FILE, "\"{}\" stands for both {} and {}", &[n, other, &p.name])),
                _ => { seen.insert(n, &p.name); }
            }
        }
    }
    let me = people.iter().filter(|p| p.relationship.eq_ignore_ascii_case("me")).count();
    if me == 0 { warn(Warning::new(FILE, "no row has the relationship \"me\"; exactly one should")); }
    if me > 1 { warn(Warning::varied(FILE, "{} rows have the relationship \"me\"; exactly one should", &[&me.to_string()])); }
    Ok(People { found: true, people, warnings })
}
