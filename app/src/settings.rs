// The settings file: ~/Library/Application Support/<bundle id>/settings.json. It holds the workspace folder's
// path and nothing else (SPEC.md, decision 28).
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

fn file(app: &AppHandle) -> io::Result<PathBuf> {
    let dir = app.path().app_config_dir().map_err(|e| io::Error::other(e.to_string()))?;
    Ok(dir.join("settings.json"))
}

/// The remembered workspace folder, if there is one. A file that can't be read counts as none.
pub fn load(app: &AppHandle) -> Option<PathBuf> {
    let text = fs::read_to_string(file(app).ok()?).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value.get("workspace")?.as_str().map(PathBuf::from)
}

/// Remembers the workspace folder. Written to a temporary file in the same folder, then renamed over it.
pub fn save(app: &AppHandle, folder: &Path) -> io::Result<()> {
    let path = file(app)?;
    let dir = path.parent().expect("settings.json is inside a folder");
    fs::create_dir_all(dir)?;
    let tmp = dir.join(".settings.json.tmp");
    let text = serde_json::to_string_pretty(&json!({ "workspace": folder.to_string_lossy() })).unwrap() + "\n";
    fs::write(&tmp, text).and_then(|_| fs::rename(&tmp, &path)).inspect_err(|_| { let _ = fs::remove_file(&tmp); })
}
