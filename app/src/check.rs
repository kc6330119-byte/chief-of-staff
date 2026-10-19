// Check mode: `chief-of-staff --check <workspace folder> [--file meeting-notes/<name>.md] [--json]` reports what the
// Meetings page lists as could not be read, then exits. main.rs runs it before Tauri starts, so there is no window, menu
// or Dock icon, and no server. It reads the workspace through the core, as the window does, and writes nothing anywhere:
// not the workspace, not the settings file, not a log. The workspace the app opens is never changed.
//
// Exit codes: 0 when nothing could not be read, 1 when something could not be read, 2 when the folder or file can't be
// opened or isn't a workspace (with one line on stderr).
use std::ffi::OsString;
use std::path::{Path, PathBuf};

use chief_of_staff_core::{group_warnings, meetings, Core, Error, Policy, Warning, Workspace};
use serde_json::json;

use crate::workspace::looks_like_workspace;
use crate::ORIGIN;

pub const USAGE: &str = "usage: chief-of-staff --check <workspace folder> [--file meeting-notes/<name>.md] [--json]";
const MEETINGS_DIR: &str = "meeting-notes/";

#[derive(Debug, PartialEq, Clone)]
pub struct Args {
    pub folder: PathBuf,
    pub file: Option<File>,
    pub json: bool,
}

/// The summary --file names.
#[derive(Debug, PartialEq, Clone)]
pub enum File {
    /// Its name in meeting-notes/, without the folder.
    Name(String),
    /// An absolute path, which must be in the workspace's meeting-notes/.
    Path(PathBuf),
}

/// None when the arguments don't ask for the check, so the app starts as usual. Err holds the line for stderr.
pub fn parse(args: &[OsString]) -> Option<Result<Args, String>> {
    if !args.iter().any(|a| a == "--check") { return None; }
    Some(parse_check(args))
}

fn parse_check(args: &[OsString]) -> Result<Args, String> {
    let (mut folder, mut file, mut json) = (None, None, false);
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        match arg.to_str() {
            Some("--check") if folder.is_none() => folder = Some(PathBuf::from(rest.next().filter(|f| !f.is_empty()).ok_or(USAGE)?)),
            Some("--file") if file.is_none() => {
                let path = rest.next().ok_or(USAGE)?.to_str().ok_or("--file: the name is not valid UTF-8")?;
                if Path::new(path).is_absolute() {
                    file = Some(File::Path(PathBuf::from(path)));
                    continue;
                }
                let name = path.strip_prefix(MEETINGS_DIR).filter(|n| !n.is_empty() && !n.contains('/'))
                    .ok_or_else(|| format!("--file {path}: give a summary as meeting-notes/<name>.md"))?;
                file = Some(File::Name(name.to_string()));
            }
            Some("--json") if !json => json = true,
            _ => return Err(USAGE.to_string()),
        }
    }
    Ok(Args { folder: folder.ok_or(USAGE)?, file, json })
}

/// What the check prints and the code it exits with.
#[derive(Debug)]
pub struct Outcome {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

fn cannot(line: String) -> Outcome {
    Outcome { code: 2, stdout: String::new(), stderr: line + "\n" }
}

/// Runs the check: reads only.
pub fn run(args: Result<Args, String>) -> Outcome {
    let args = match args {
        Ok(a) => a,
        Err(line) => return cannot(line),
    };
    let warnings = match could_not_read(&args.folder, args.file.as_ref()) {
        Ok(w) => w,
        Err(line) => return cannot(line),
    };
    let groups = group_warnings(&warnings);
    let stdout = if args.json {
        let out = json!({ "total": warnings.len(), "groups": groups.iter().map(|g| g.to_json()).collect::<Vec<_>>() });
        serde_json::to_string_pretty(&out).unwrap() + "\n"
    } else {
        let mut out = match warnings.len() {
            0 => "Nothing could not be read\n".to_string(),
            1 => "1 thing could not be read\n".to_string(),
            n => format!("{n} things could not be read\n"),
        };
        for line in lines(&warnings) { out += &line; out.push('\n'); }
        out
    };
    Outcome { code: if warnings.is_empty() { 0 } else { 1 }, stdout, stderr: String::new() }
}

/// The warnings as the check prints them, one "<file>: <message>" each, grouped by kind, most first.
pub fn lines(warnings: &[Warning]) -> Vec<String> {
    group_warnings(warnings).iter().flat_map(|g| &g.warnings).map(|w| format!("{}: {}", w.file, w.message)).collect()
}

/// What could not be read in the workspace at `folder`, or in one summary there. Err holds the line for stderr when the
/// folder or the summary can't be opened.
pub fn could_not_read(folder: &Path, file: Option<&File>) -> Result<Vec<Warning>, String> {
    let shown = folder.display().to_string();
    let folder = std::path::absolute(folder).map_err(|e| format!("{shown}: the folder can't be opened: {e}"))?;
    if let Err(e) = std::fs::read_dir(&folder) { return Err(format!("{shown}: the folder can't be opened: {e}")); }
    if !looks_like_workspace(&folder) {
        return Err(format!("{shown}: not a {} workspace (no meeting-notes, CLAUDE.md, library or corrections)", *chief_of_staff_core::APP_NAME));
    }
    let name = match file {
        None => None,
        Some(File::Name(name)) => Some(name.clone()),
        Some(File::Path(path)) => Some(name_in_meetings(&folder, path)
            .ok_or_else(|| format!("--file {}: give a summary in {shown}/{MEETINGS_DIR}", path.display()))?),
    };
    let core = Core::new(Workspace::new(&folder), Policy::app_scheme(ORIGIN), |_| {});
    if let Some(name) = &name {
        // Only a summary listed from meeting-notes/, as on Meetings; the name is never resolved as a path.
        match meetings::summary_files(core.workspace()) {
            Ok(files) if files.iter().any(|f| f == name) => {}
            Ok(_) => return Err(format!("{MEETINGS_DIR}{name}: there is no such summary in {shown}")),
            Err(e) => return Err(format!("{shown}: {}", describe(&e))),
        }
    }
    match core.could_not_read() {
        Ok(w) => Ok(w.into_iter().filter(|w| name.as_ref().is_none_or(|f| &w.file == f)).collect()),
        Err(e) => Err(format!("{shown}: {}", describe(&e))),
    }
}

/// The name of an absolute path's file when it sits directly in the workspace's meeting-notes/: compared as written,
/// or else as the disk resolves both (/tmp and /private/tmp are one folder on a Mac).
fn name_in_meetings(folder: &Path, path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?.to_string();
    let parent = path.parent()?;
    let meetings = folder.join(MEETINGS_DIR.trim_end_matches('/'));
    let same = parent == meetings || matches!((parent.canonicalize(), meetings.canonicalize()), (Ok(a), Ok(b)) if a == b);
    same.then_some(name)
}

fn describe(e: &Error) -> String {
    match e {
        Error::Status(_, m) | Error::Path(m) | Error::Internal(m) => m.clone(),
        Error::NotFound => "a file could not be found".into(),
        Error::NoSummary(name) => format!("there is no summary named \"{name}\" in meeting-notes/"),
        Error::NoPerson(_, m) => m.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;

    fn args(list: &[&str]) -> Vec<OsString> {
        list.iter().map(OsString::from).collect()
    }

    fn check(list: &[&str]) -> Outcome {
        run(parse(&args(list)).expect("check mode"))
    }

    fn repo(name: &str) -> String {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(name).to_string_lossy().into_owned()
    }

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mc-check-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn without_check_the_app_starts_as_usual() {
        assert_eq!(parse(&args(&[])), None);
        assert_eq!(parse(&args(&["--json"])), None);
        assert_eq!(parse(&args(&["-psn_0_12345"])), None);
        assert_eq!(parse(&args(&["/some/folder", "--file", "meeting-notes/x.md"])), None);
    }

    #[test]
    fn the_arguments_are_read_in_any_order() {
        let want = Args { folder: "/ws".into(), file: Some(File::Name("2026-10-01_x.md".into())), json: true };
        for list in [
            ["--check", "/ws", "--file", "meeting-notes/2026-10-01_x.md", "--json"],
            ["--json", "--check", "/ws", "--file", "meeting-notes/2026-10-01_x.md"],
            ["--file", "meeting-notes/2026-10-01_x.md", "--json", "--check", "/ws"],
        ] {
            assert_eq!(parse(&args(&list)), Some(Ok(want.clone())), "{list:?}");
        }
        assert_eq!(parse(&args(&["--check", "rel/ws"])), Some(Ok(Args { folder: "rel/ws".into(), file: None, json: false })));
    }

    #[test]
    fn anything_else_with_check_is_refused() {
        for list in [
            &["--check"][..],
            &["--check", ""],
            &["--check", "/ws", "--file"],
            &["--check", "/ws", "--file", "x.md"],
            &["--check", "/ws", "--file", "meeting-notes/"],
            &["--check", "/ws", "--file", "meeting-notes/sub/x.md"],
            &["--check", "/ws", "--json", "--json"],
            &["--check", "/ws", "--check", "/other"],
            &["--check", "/ws", "extra"],
            &["--check", "/ws", "--verbose"],
        ] {
            assert!(matches!(parse(&args(list)), Some(Err(_))), "{list:?}");
            let out = check(list);
            assert_eq!(out.code, 2, "{list:?}");
            assert_eq!(out.stdout, "");
            assert_eq!(out.stderr.lines().count(), 1, "{list:?}: {}", out.stderr);
        }
    }

    #[test]
    fn the_sample_and_the_starter_have_nothing_that_could_not_be_read() {
        for ws in [repo("sample-workspace"), repo("starter-workspace")] {
            let out = check(&["--check", &ws]);
            assert_eq!((out.code, out.stdout.as_str(), out.stderr.as_str()), (0, "Nothing could not be read\n", ""), "{ws}");
            let out = check(&["--check", &ws, "--json"]);
            assert_eq!(out.code, 0);
            assert_eq!(serde_json::from_str::<serde_json::Value>(&out.stdout).unwrap(), json!({ "total": 0, "groups": [] }));
        }
    }

    fn broken_workspace(name: &str) -> PathBuf {
        let dir = scratch(name);
        fs::create_dir_all(dir.join("meeting-notes")).unwrap();
        fs::write(dir.join("meeting-notes/2026-10-01_a.md"), "# A\n\n## Action Items\n\n| ID | Action Item | Owner | Status |\n|---|---|---|---|\n| A-2610-1 | x | | Open |\n").unwrap();
        fs::write(dir.join("meeting-notes/2026-10-02_b.md"), "# B\n").unwrap();
        dir
    }

    #[test]
    fn warnings_exit_1_and_file_narrows_them() {
        let dir = broken_workspace("warnings");
        let ws = dir.to_string_lossy().into_owned();
        let all = check(&["--check", &ws]);
        assert_eq!(all.code, 1);
        let first = all.stdout.lines().next().unwrap();
        let n: usize = first.strip_suffix(" things could not be read").unwrap().parse().unwrap();
        assert_eq!(all.stdout.lines().count(), n + 1);
        assert!(all.stdout.contains("2026-10-01_a.md: ID \"A-2610-1\" is not in the form A-YYMMDD-n\n"), "{}", all.stdout);
        assert!(all.stdout.contains("2026-10-02_b.md: no \"Action Items\" section\n"), "{}", all.stdout);

        let one = check(&["--check", &ws, "--file", "meeting-notes/2026-10-02_b.md"]);
        assert_eq!(one.code, 1);
        assert!(one.stdout.lines().skip(1).all(|l| l.starts_with("2026-10-02_b.md: ")), "{}", one.stdout);
        assert!(one.stdout.lines().count() > 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn file_takes_an_absolute_path_in_the_workspace_meeting_notes() {
        let ws = repo("sample-workspace");
        let file = format!("{ws}/meeting-notes/2026-09-15_kevin-sam_1on1.md");
        assert_eq!(parse(&args(&["--check", &ws, "--file", &file])), Some(Ok(Args { folder: ws.clone().into(), file: Some(File::Path(file.clone().into())), json: false })));
        let by_name = check(&["--check", &ws, "--file", "meeting-notes/2026-09-15_kevin-sam_1on1.md"]);
        let by_path = check(&["--check", &ws, "--file", &file]);
        assert_eq!((by_path.code, by_path.stdout.as_str(), by_path.stderr.as_str()), (0, "Nothing could not be read\n", ""));
        assert_eq!((by_name.code, by_name.stdout), (by_path.code, by_path.stdout));
        // Written another way that names the same folder.
        let roundabout = format!("{ws}/meeting-notes/../meeting-notes/2026-09-15_kevin-sam_1on1.md");
        assert_eq!(check(&["--check", &ws, "--file", &roundabout]).code, 0);

        let dir = broken_workspace("absolute");
        let other = dir.to_string_lossy().into_owned();
        let one = check(&["--check", &other, "--file", &format!("{other}/meeting-notes/2026-10-02_b.md")]);
        assert_eq!(one.code, 1);
        assert!(one.stdout.lines().skip(1).all(|l| l.starts_with("2026-10-02_b.md: ")), "{}", one.stdout);
        // Outside the workspace's meeting-notes/, or not there at all: exit 2.
        for f in [format!("{other}/meeting-notes/2026-10-02_b.md"), format!("{ws}/people.md"), format!("{ws}/meeting-notes/nope.md"),
            format!("{ws}/meeting-notes"), format!("{ws}/templates/meeting-summary-template.md")] {
            let out = check(&["--check", &ws, "--file", &f]);
            assert_eq!((out.code, out.stdout.as_str(), out.stderr.lines().count()), (2, "", 1), "{f}: {}", out.stderr);
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_folder_or_file_that_cannot_be_opened_exits_2() {
        let dir = scratch("cannot");
        let missing = dir.join("missing").to_string_lossy().into_owned();
        let empty = dir.to_string_lossy().into_owned();
        let a_file = dir.join("a-file");
        fs::write(&a_file, "x").unwrap();
        for list in [
            vec!["--check", missing.as_str()],
            vec!["--check", empty.as_str()],
            vec!["--check", a_file.to_str().unwrap()],
            vec!["--check", &repo("starter-workspace"), "--file", "meeting-notes/nope.md"],
            vec!["--check", &repo("starter-workspace"), "--file", "meeting-notes/README.txt"],
        ] {
            let out = check(&list);
            assert_eq!(out.code, 2, "{list:?}");
            assert_eq!(out.stdout, "");
            assert_eq!(out.stderr.lines().count(), 1, "{list:?}: {}", out.stderr);
        }
        fs::remove_dir_all(&dir).unwrap();
    }
}
