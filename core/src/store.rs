// The only place the core writes files. Anything not on the allowlist is refused.
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::paths::Workspace;
use crate::{js, Error};

pub const WRITABLE: [&str; 4] = ["actions/ledger.json", "notes/notes.json", "library/books.json", "corrections/corrections.json"];

/// JSON.stringify(data, null, 2) + "\n".
pub fn to_json_text(data: &Value) -> String {
    serde_json::to_string_pretty(&js::normalize_numbers(data.clone())).unwrap() + "\n"
}

/// Writes to a temporary file next to the target, then renames it over the target, so a crash
/// mid-write never leaves a half-written file.
pub fn write_json_atomic(ws: &Workspace, rel: &str, data: &Value) -> Result<(), Error> {
    if !WRITABLE.contains(&rel) { return Err(Error::Path(format!("Refused: the app never writes {rel}"))); }
    let abs = ws.resolve(rel)?;
    let dir = abs.parent().expect("a file inside the data root");
    fs::create_dir_all(dir)?;
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let name = abs.file_name().unwrap().to_string_lossy();
    let tmp = dir.join(format!(".{name}.{}.{millis}.tmp", std::process::id()));
    let result = fs::write(&tmp, to_json_text(data)).and_then(|_| fs::rename(&tmp, &abs));
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_four_files_are_written() {
        assert_eq!(WRITABLE, ["actions/ledger.json", "notes/notes.json", "library/books.json", "corrections/corrections.json"]);
        let ws = Workspace::new(std::env::temp_dir().join("mc-store-refusal"));
        // board/board.json is from an earlier version: never written again.
        // A meeting summary is never edited, notes or no notes.
        for rel in ["CLAUDE.md", "board/board.json", "meeting-notes/2026-09-15_kevin-sam_1on1.md", "notes/other.json"] {
            match write_json_atomic(&ws, rel, &Value::Null) {
                Err(Error::Path(m)) => assert_eq!(m, format!("Refused: the app never writes {rel}")),
                other => panic!("expected a refusal, got {other:?}"),
            }
        }
    }
}
