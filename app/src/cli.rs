// The command line (0.4.1), read before anything of Tauri starts: --help and --version, the check (check.rs) and the
// hook (hook.rs). An option the app doesn't know prints the help and exits 2; it never opens the window. macOS may pass
// -psn_<number> to an app it opens, which is passed over.
use std::ffi::OsString;

use crate::check::{self, Outcome};
use crate::hook;

pub fn version() -> String {
    format!("{} {}", *chief_of_staff_core::APP_NAME, env!("CARGO_PKG_VERSION"))
}

pub fn help() -> String {
    format!("{}

With no options, the app opens its window. With these, it prints its answer and exits, and no window opens.

  --check <workspace folder>  Report what the app could not read in the workspace, as Meetings lists it. Exits 0
                              when nothing could not be read, 1 when something could not be read, 2 when the folder
                              can't be opened or isn't a workspace. Writes nothing.
  --file meeting-notes/<name>.md
                              With --check: only that summary.
  --json                      With --check: the report as JSON.
  --hook                      For Claude Code's hook in a workspace: check the summary named in the JSON on stdin.
  --help, -h                  Print this help.
  --version                   Print the version.
", version())
}

/// What the arguments ask for: Some when the app answers and exits without starting Tauri, None to open the window.
pub fn decide(args: &[OsString]) -> Option<Outcome> {
    let (mut flags, mut unknown) = (Vec::new(), None);
    let mut rest = args.iter();
    while let Some(arg) = rest.next() {
        let text = arg.to_string_lossy().into_owned();
        match text.as_str() {
            // Their values are not options, even one that starts with "-".
            "--check" | "--file" => { rest.next(); }
            "--json" | "--hook" | "--help" | "-h" | "--version" => {}
            t if t.starts_with("-psn_") => continue,
            t if t.starts_with('-') => { unknown.get_or_insert(text.clone()); }
            _ => continue,
        }
        flags.push(text);
    }
    let has = |f: &str| flags.iter().any(|a| a == f);
    let exit = |code: i32, stdout: String, stderr: String| Some(Outcome { code, stdout, stderr });
    if has("--help") || has("-h") { return exit(0, help(), String::new()); }
    if has("--version") { return exit(0, version() + "\n", String::new()); }
    if let Some(option) = unknown { return exit(2, String::new(), format!("Unknown option: {option}\n\n{}", help())); }
    if hook::wanted(args) { return Some(hook::run_stdin(args)); }
    if let Some(parsed) = check::parse(args) { return Some(check::run(parsed)); }
    // --file and --json mean nothing without --check.
    if let Some(option) = ["--file", "--json"].into_iter().find(|f| has(f)) {
        return exit(2, String::new(), format!("{option} works only with --check\n\n{}", help()));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decide_on(list: &[&str]) -> Option<Outcome> {
        decide(&list.iter().map(OsString::from).collect::<Vec<_>>())
    }

    #[test]
    fn help_lists_every_option_and_exits_0() {
        for list in [&["--help"][..], &["-h"], &["--check", "/ws", "--help"], &["--version", "-h"], &["--bogus", "--help"], &["-psn_0_123", "-h"]] {
            let out = decide_on(list).expect("no window");
            assert_eq!((out.code, out.stderr.as_str()), (0, ""), "{list:?}");
            assert_eq!(out.stdout, help(), "{list:?}");
        }
        let text = help();
        assert!(text.starts_with("Chief of Staff for Managers 0.4.1\n\n"), "{text}");
        for option in ["--check", "--file", "--json", "--hook", "--help, -h", "--version"] {
            assert!(text.contains(&format!("\n  {option} ")) || text.contains(&format!("\n  {option}\n")), "{option}");
        }
    }

    #[test]
    fn version_prints_the_name_and_version_and_exits_0() {
        for list in [&["--version"][..], &["-psn_0_123", "--version"], &["--check", "/ws", "--version"]] {
            let out = decide_on(list).expect("no window");
            assert_eq!((out.code, out.stdout.as_str(), out.stderr.as_str()), (0, "Chief of Staff for Managers 0.4.1\n", ""), "{list:?}");
        }
        assert_eq!(env!("CARGO_PKG_VERSION"), "0.4.1");
    }

    #[test]
    fn an_unknown_option_prints_the_help_to_stderr_and_exits_2() {
        for (list, option) in [(&["--bogus"][..], "--bogus"), (&["-x"], "-x"), (&["-"], "-"), (&["--Help"], "--Help"), (&["--check=/ws"], "--check=/ws"),
            (&["--check", "/ws", "--verbose"], "--verbose"), (&["--hook", "--verbose"], "--verbose"), (&["-psn_0_1", "--psn"], "--psn"),
            (&["--first", "--second"], "--first"), (&["/some/folder", "-v"], "-v")] {
            let out = decide_on(list).expect("no window");
            assert_eq!((out.code, out.stdout.as_str()), (2, ""), "{list:?}");
            assert_eq!(out.stderr, format!("Unknown option: {option}\n\n{}", help()), "{list:?}");
        }
    }

    #[test]
    fn a_value_that_starts_with_a_dash_is_not_an_option() {
        // A folder named "-ws" is the check's to open; it isn't one, so the check exits 2 with its one line.
        let out = decide_on(&["--check", "-ws"]).expect("no window");
        assert_eq!(out.code, 2);
        assert!(!out.stderr.contains("Unknown option"), "{}", out.stderr);
        assert_eq!(out.stderr.lines().count(), 1, "{}", out.stderr);
    }

    #[test]
    fn file_and_json_without_check_exit_2() {
        for (list, option) in [(&["--json"][..], "--json"), (&["--file", "meeting-notes/x.md"], "--file"), (&["/some/folder", "--file", "meeting-notes/x.md"], "--file")] {
            let out = decide_on(list).expect("no window");
            assert_eq!((out.code, out.stdout.as_str()), (2, ""), "{list:?}");
            assert_eq!(out.stderr, format!("{option} works only with --check\n\n{}", help()));
        }
    }

    #[test]
    fn the_check_and_the_hook_answer_as_before() {
        let ws = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../sample-workspace").to_string_lossy().into_owned();
        let out = decide_on(&["--check", &ws]).expect("no window");
        assert_eq!((out.code, out.stdout.as_str()), (0, "Nothing could not be read\n"));
        let out = decide_on(&["--check", &ws, "extra"]).expect("no window");
        assert_eq!((out.code, out.stderr.as_str()), (2, format!("{}\n", check::USAGE).as_str()));
        // Anything after --hook that isn't an option: the hook's own line, exit 0, so Claude's work goes on.
        let out = hook::run(&[OsString::from("--hook"), OsString::from("extra")], "{}");
        assert_eq!((out.code, out.stderr.lines().count()), (0, 1));
    }

    #[test]
    fn otherwise_the_window_opens() {
        for list in [&[][..], &["-psn_0_12345"], &["/some/folder"], &["-psn_0_1", "/some/folder"]] {
            assert!(decide_on(list).is_none(), "{list:?}");
        }
    }
}
