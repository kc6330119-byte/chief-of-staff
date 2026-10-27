// The command line, on the built app (0.4.1): each of these answers and exits before Tauri starts. If one started it,
// the window would open and the process would not end; it is given 20 seconds, then killed and the test fails. Each
// runs with HOME set to an empty folder, which must still be empty after: Tauri would write its settings or WebKit data
// there.
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

const APP: &str = env!("CARGO_BIN_EXE_chief-of-staff");

struct Ran {
    code: i32,
    stdout: String,
    stderr: String,
}

fn run(args: &[&str]) -> Ran {
    static RUNS: AtomicUsize = AtomicUsize::new(0);
    let home = std::env::temp_dir().join(format!("mc-cli-home-{}-{}", std::process::id(), RUNS.fetch_add(1, Ordering::SeqCst)));
    let _ = fs::remove_dir_all(&home);
    fs::create_dir_all(&home).unwrap();
    let mut child = Command::new(APP).args(args).env("HOME", &home).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    let end = Instant::now() + Duration::from_secs(20);
    while child.try_wait().unwrap().is_none() {
        if Instant::now() > end {
            let _ = child.kill();
            panic!("{args:?}: still running after 20 s, so the app started");
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    let out = child.wait_with_output().unwrap();
    assert_eq!(fs::read_dir(&home).unwrap().count(), 0, "{args:?}: wrote to the home folder");
    fs::remove_dir_all(&home).unwrap();
    Ran { code: out.status.code().expect("exited"), stdout: String::from_utf8(out.stdout).unwrap(), stderr: String::from_utf8(out.stderr).unwrap() }
}

#[test]
fn help_prints_the_options_and_exits_0() {
    let first = run(&["--help"]);
    assert_eq!((first.code, first.stderr.as_str()), (0, ""));
    assert!(first.stdout.starts_with("Chief of Staff for Managers 0.4.1\n"), "{}", first.stdout);
    for option in ["--check", "--file", "--json", "--hook", "--help, -h", "--version"] {
        assert!(first.stdout.contains(&format!("\n  {option}")), "{option}");
    }
    let short = run(&["-h"]);
    assert_eq!((short.code, short.stdout, short.stderr), (0, first.stdout, String::new()));
}

#[test]
fn version_prints_the_name_and_version_and_exits_0() {
    for args in [&["--version"][..], &["-psn_0_4242", "--version"]] {
        let out = run(args);
        assert_eq!((out.code, out.stdout.as_str(), out.stderr.as_str()), (0, "Chief of Staff for Managers 0.4.1\n", ""), "{args:?}");
    }
}

#[test]
fn an_unknown_option_prints_the_help_to_stderr_and_exits_2() {
    let help = run(&["--help"]).stdout;
    for (args, option) in [(&["--bogus"][..], "--bogus"), (&["-x"], "-x"), (&["-psn_0_4242", "--Version"], "--Version"), (&["--check", "/tmp", "--verbose"], "--verbose")] {
        let out = run(args);
        assert_eq!((out.code, out.stdout.as_str()), (2, ""), "{args:?}");
        assert_eq!(out.stderr, format!("Unknown option: {option}\n\n{help}"), "{args:?}");
    }
}

#[test]
fn json_without_check_exits_2() {
    let out = run(&["--json"]);
    assert_eq!((out.code, out.stdout.as_str()), (2, ""));
    assert!(out.stderr.starts_with("--json works only with --check\n\n"), "{}", out.stderr);
}

#[test]
fn the_check_still_runs_from_the_command_line() {
    let ws: PathBuf = [env!("CARGO_MANIFEST_DIR"), "..", "sample-workspace"].iter().collect();
    let out = run(&["--check", ws.to_str().unwrap()]);
    assert_eq!((out.code, out.stdout.as_str(), out.stderr.as_str()), (0, "Nothing could not be read\n", ""));
}
