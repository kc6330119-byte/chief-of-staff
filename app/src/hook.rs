// Hook mode: `chief-of-staff --hook` reads a Claude Code PostToolUse payload as JSON on stdin and checks the summary
// Claude just saved, with the same check as `--check <workspace> --file <summary>` (check.rs). The workspace's
// .claude/settings.json runs it after each Edit or Write. Like the check, it starts no part of Tauri, opens no window
// and no network connection, and writes nothing anywhere.
//
// Exit codes, as Claude Code reads them: 2 when the summary has things that could not be read, with the message for
// Claude on stderr; 0 otherwise. A payload it can't read, or a summary it can't open, is 0 with one line on stderr:
// the hook never blocks Claude's work.
use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::check::{self, File, Outcome};

const MEETINGS_DIR: &str = "meeting-notes";

/// Whether the arguments ask for the hook.
pub fn wanted(args: &[OsString]) -> bool {
    args.iter().any(|a| a == "--hook")
}

/// Reads the payload from stdin and runs the hook.
pub fn run_stdin(args: &[OsString]) -> Outcome {
    let mut input = String::new();
    if let Err(e) = std::io::stdin().read_to_string(&mut input) {
        return passed(format!("the hook's input could not be read: {e}"));
    }
    run(args, &input)
}

/// Runs the hook on a payload: reads only.
pub fn run(args: &[OsString], input: &str) -> Outcome {
    if args.len() != 1 { return passed("usage: chief-of-staff --hook, with the hook's JSON on stdin".into()); }
    let payload: Value = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(e) => return passed(format!("the hook's input is not JSON: {e}")),
    };
    let Some(written) = payload.pointer("/tool_input/file_path").and_then(Value::as_str).filter(|p| !p.is_empty()) else {
        return passed("the hook's input has no tool_input.file_path".into());
    };
    let mut path = PathBuf::from(written);
    if path.is_relative() {
        match payload.get("cwd").and_then(Value::as_str) {
            Some(cwd) => path = Path::new(cwd).join(path),
            None => return passed(format!("{written}: a relative path, and the hook's input has no cwd")),
        }
    }
    let Some(workspace) = summary_workspace(&path) else { return Outcome { code: 0, stdout: String::new(), stderr: String::new() } };
    let name = path.file_name().unwrap().to_string_lossy().into_owned();
    match check::could_not_read(workspace, Some(&File::Path(path.clone()))) {
        Err(line) => passed(line),
        Ok(warnings) if warnings.is_empty() => Outcome { code: 0, stdout: String::new(), stderr: String::new() },
        Ok(warnings) => {
            let n = warnings.len();
            let mut stderr = format!("{} could not read {n} thing{} in {name}:\n", *chief_of_staff_core::APP_NAME, if n == 1 { "" } else { "s" });
            for line in check::lines(&warnings) { stderr += &line; stderr.push('\n'); }
            stderr += "Fix these in the summary and save it again.\n";
            Outcome { code: 2, stdout: String::new(), stderr }
        }
    }
}

/// The workspace for a file that is a .md directly inside a meeting-notes/ folder: the folder that holds meeting-notes/.
fn summary_workspace(path: &Path) -> Option<&Path> {
    if path.extension()? != "md" { return None; }
    let meetings = path.parent()?;
    if meetings.file_name()? != MEETINGS_DIR { return None; }
    meetings.parent()
}

/// Exit 0, so Claude's work goes on, with one line on stderr saying why nothing was checked.
fn passed(line: String) -> Outcome {
    Outcome { code: 0, stdout: String::new(), stderr: format!("{}: {line}\n", *chief_of_staff_core::APP_NAME) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use serde_json::json;

    fn hook(input: &str) -> Outcome {
        run(&[OsString::from("--hook")], input)
    }

    fn repo(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(name)
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mc-hook-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    // The payloads Claude Code sent in step 1, for a Write and then an Edit of the same file.
    fn payload(tool: &str, file: &Path, cwd: &Path) -> String {
        let (input, response) = match tool {
            "Write" => (json!({ "file_path": file, "content": "first\n" }),
                json!({ "type": "create", "filePath": file, "content": "first\n", "structuredPatch": [], "originalFile": null, "userModified": false })),
            _ => (json!({ "file_path": file, "old_string": "first", "new_string": "second", "replace_all": false }),
                json!({ "filePath": file, "oldString": "first", "newString": "second", "originalFile": "first\n", "userModified": false, "replaceAll": false })),
        };
        json!({
            "session_id": "b1beff93-9d7d-4d5f-839e-887896d914c3",
            "transcript_path": "<home>/.claude/projects/p/b1beff93-9d7d-4d5f-839e-887896d914c3.jsonl",
            "cwd": cwd,
            "prompt_id": "18d9e4c3-3ecf-48f4-8f01-a8794dc0413e",
            "permission_mode": "default",
            "effort": { "level": "medium" },
            "hook_event_name": "PostToolUse",
            "tool_name": tool,
            "tool_input": input,
            "tool_response": response,
            "tool_use_id": "toolu_01RaZ1D8rffw2KSsaFLzEDYP",
            "duration_ms": 11,
        }).to_string()
    }

    fn snapshot(dir: &Path) -> Vec<(PathBuf, Vec<u8>)> {
        let mut out = Vec::new();
        for entry in fs::read_dir(dir).unwrap() {
            let p = entry.unwrap().path();
            if p.is_dir() { out.extend(snapshot(&p)); } else { out.push((p.clone(), fs::read(&p).unwrap())); }
        }
        out.sort();
        out
    }

    fn copy(from: &Path, to: &Path) {
        fs::create_dir_all(to).unwrap();
        for entry in fs::read_dir(from).unwrap() {
            let p = entry.unwrap().path();
            let t = to.join(p.file_name().unwrap());
            if p.is_dir() { copy(&p, &t); } else { fs::copy(&p, &t).unwrap(); }
        }
    }

    const BAD_ID: &str = "| A-2610-1 |";

    #[test]
    fn a_clean_summary_is_silent_for_write_and_edit() {
        let ws = repo("sample-workspace");
        let file = ws.join("meeting-notes/2026-09-15_kevin-sam_1on1.md");
        for tool in ["Write", "Edit"] {
            let out = hook(&payload(tool, &file, &ws));
            assert_eq!((out.code, out.stdout.as_str(), out.stderr.as_str()), (0, "", ""), "{tool}");
        }
    }

    #[test]
    fn a_summary_with_warnings_exits_2_with_the_message_for_claude() {
        let dir = scratch("warnings");
        copy(&repo("sample-workspace"), &dir);
        let file = dir.join("meeting-notes/2026-09-15_kevin-sam_1on1.md");
        let text = fs::read_to_string(&file).unwrap();
        assert!(text.contains("\n| A-260915-1 |"));
        fs::write(&file, text.replacen("\n| A-260915-1 |", &format!("\n{BAD_ID}"), 1)).unwrap();
        let before = snapshot(&dir);
        for tool in ["Write", "Edit"] {
            let out = hook(&payload(tool, &file, &dir));
            assert_eq!(out.code, 2, "{tool}: {}", out.stderr);
            assert_eq!(out.stdout, "");
            let lines: Vec<&str> = out.stderr.lines().collect();
            assert_eq!(lines[0], "Chief of Staff for Managers could not read 1 thing in 2026-09-15_kevin-sam_1on1.md:");
            assert_eq!(lines[1], "2026-09-15_kevin-sam_1on1.md: ID \"A-2610-1\" is not in the form A-YYMMDD-n");
            assert_eq!(lines[2], "Fix these in the summary and save it again.");
            assert_eq!(lines.len(), 3);
            // The same lines as the check gives for that summary.
            let checked = check::run(Ok(check::Args { folder: dir.clone(), file: Some(File::Name("2026-09-15_kevin-sam_1on1.md".into())), json: false }));
            assert_eq!(checked.stdout.lines().skip(1).collect::<Vec<_>>(), lines[1..lines.len() - 1]);
        }
        assert_eq!(snapshot(&dir), before);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn several_warnings_are_counted() {
        let dir = scratch("several");
        fs::create_dir_all(dir.join("meeting-notes")).unwrap();
        let file = dir.join("meeting-notes/2026-10-02_b.md");
        fs::write(&file, "# B\n").unwrap();
        let out = hook(&payload("Write", &file, &dir));
        assert_eq!(out.code, 2);
        let n = out.stderr.lines().count() - 2;
        assert!(n > 1, "{}", out.stderr);
        assert!(out.stderr.starts_with(&format!("Chief of Staff for Managers could not read {n} things in 2026-10-02_b.md:\n")), "{}", out.stderr);
        assert!(out.stderr.ends_with("\nFix these in the summary and save it again.\n"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_file_that_is_not_a_summary_is_silent() {
        let ws = repo("sample-workspace");
        for rel in ["people.md", "CLAUDE.md", "templates/meeting-summary-template.md", "meeting-notes/notes.txt",
            "meeting-notes/sub/2026-09-15_x.md", "transcripts/Riley 1-1 - 20260929.txt", "shared/meeting-notes-copy.md"] {
            let out = hook(&payload("Write", &ws.join(rel), &ws));
            assert_eq!((out.code, out.stdout.as_str(), out.stderr.as_str()), (0, "", ""), "{rel}");
        }
        // A relative path is read against cwd.
        let out = hook(&payload("Edit", Path::new("people.md"), &ws));
        assert_eq!((out.code, out.stderr.as_str()), (0, ""));
    }

    #[test]
    fn a_relative_path_is_read_against_cwd() {
        let dir = scratch("relative");
        fs::create_dir_all(dir.join("meeting-notes")).unwrap();
        fs::write(dir.join("meeting-notes/2026-10-02_b.md"), "# B\n").unwrap();
        let out = hook(&payload("Write", Path::new("meeting-notes/2026-10-02_b.md"), &dir));
        assert_eq!(out.code, 2, "{}", out.stderr);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn input_it_cannot_read_exits_0_with_one_line() {
        let ws = repo("sample-workspace");
        let missing = payload("Write", &ws.join("meeting-notes/2026-01-01_gone.md"), &ws);
        let no_folder = payload("Write", Path::new("/nowhere/at/all/meeting-notes/2026-01-01_x.md"), &ws);
        let mut no_cwd: Value = serde_json::from_str(&payload("Write", Path::new("meeting-notes/x.md"), &ws)).unwrap();
        no_cwd.as_object_mut().unwrap().remove("cwd");
        for input in ["", "not json", "{", "[]", "{}", "{\"tool_input\":{}}", "{\"tool_input\":{\"file_path\":7}}",
            "{\"tool_input\":{\"file_path\":\"\"}}", &missing, &no_folder, &no_cwd.to_string()] {
            let out = hook(input);
            assert_eq!(out.code, 0, "{input}");
            assert_eq!(out.stdout, "");
            assert_eq!(out.stderr.lines().count(), 1, "{input}: {}", out.stderr);
            assert!(out.stderr.ends_with('\n'));
        }
        // Anything after --hook is refused the same way.
        let out = run(&[OsString::from("--hook"), OsString::from("extra")], &payload("Write", &ws.join("people.md"), &ws));
        assert_eq!((out.code, out.stderr.lines().count()), (0, 1));
    }
}
