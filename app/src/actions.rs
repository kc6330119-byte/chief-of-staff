// Actions (0.4.1): the few things a click in the app may start outside it. The list is fixed here and nothing else is
// ever run. A Help link written [text](action:setup), a button on the Agents page, or "Set up in Claude Code" after
// File > New Workspace… names one; the window catches the address before it loads (workspace.rs), so the pages need
// no app permissions. An unknown or invalid action does nothing.
//
//   setup         in the open workspace, run  claude "Set up my workspace", only if its CLAUDE.md still has the
//                 "Setting up this workspace" section (the coach deletes it when the setup is done); else say so
//   review        run  claude "/review-transcript"
//   agent:<name>  run  claude "Use the <name> agent", only if <name> is [a-z0-9-]+ and .claude/agents/<name>.md is there
//   open-folder   show the workspace in Finder
//
// Claude Code starts in a new Terminal window, through osascript. The folder and the command are the script's two
// arguments, never part of its text. If osascript fails, or the person says no to macOS's question, Terminal is opened
// in the folder and the command is put on the clipboard instead. The app never installs anything.
//
// Everything outside the app goes through the System trait, so the tests, and the app check's probe build, record what
// would be done instead of doing it.
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, Url};

use crate::State;

#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Setup,
    Review,
    Agent(String),
    OpenFolder,
}

/// The script osascript runs, one line per -e. `argv` is the folder, then the command. A new Terminal window cd's to
/// the folder and runs the command; if Terminal wasn't running, the window it opens as it starts is used.
pub const TERMINAL_SCRIPT: &str = r#"on run argv
	set folderPath to item 1 of argv
	set shellCommand to item 2 of argv
	set fullCommand to "cd " & quoted form of folderPath & " && " & shellCommand
	set wasRunning to application "Terminal" is running
	tell application "Terminal"
		activate
		if not wasRunning then
			repeat 20 times
				if (count of windows) > 0 then exit repeat
				delay 0.1
			end repeat
		end if
		if not wasRunning and (count of windows) > 0 then
			do script fullCommand in window 1
		else
			do script fullCommand
		end if
	end tell
end run"#;

pub const INSTALL_PAGE: &str = "https://code.claude.com/docs/en/setup";
pub const NOT_INSTALLED: &str = "Claude Code isn't installed\n\nThe app looked for the claude command and didn't find it. Install Claude Code from its install page, then try again.";
pub const OPEN_INSTALL_PAGE: &str = "Open the Install Page";
pub const FALLBACK: &str = "Terminal is open in your workspace. The command is copied: paste it and press Return.";
pub const ALREADY_SET_UP: &str = "This workspace is already set up\n\nIts CLAUDE.md no longer has the \"Setting up this workspace\" section, which Claude Code removes when the setup is done. Nothing was started.";
/// The heading of the coach's first-run section, in a new workspace's CLAUDE.md.
pub const SETUP_SECTION: &str = "## Setting up this workspace";

impl Action {
    /// The action an address names: what follows "action:" in it, exactly. None for anything else, and for an agent
    /// whose name isn't [a-z0-9-]+ or that has no .claude/agents/<name>.md in the workspace at `folder`.
    pub fn parse(address: &str, folder: &Path) -> Option<Action> {
        match address.strip_prefix("action:")? {
            "setup" => Some(Action::Setup),
            "review" => Some(Action::Review),
            "open-folder" => Some(Action::OpenFolder),
            other => {
                let name = other.strip_prefix("agent:")?;
                let valid = !name.is_empty() && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
                (valid && folder.join(".claude/agents").join(format!("{name}.md")).is_file()).then(|| Action::Agent(name.to_string()))
            }
        }
    }

    /// As an address writes it, after "action:". For the probe build's report.
    #[cfg(any(test, feature = "probe"))]
    pub fn name(&self) -> String {
        match self {
            Action::Setup => "setup".into(),
            Action::Review => "review".into(),
            Action::Agent(name) => format!("agent:{name}"),
            Action::OpenFolder => "open-folder".into(),
        }
    }

    /// What Claude Code is started with, or None for an action that doesn't start it.
    fn prompt(&self) -> Option<String> {
        match self {
            Action::Setup => Some("Set up my workspace".into()),
            Action::Review => Some("/review-transcript".into()),
            Action::Agent(name) => Some(format!("Use the {name} agent")),
            Action::OpenFolder => None,
        }
    }
}

/// Everything an action does outside the app.
pub trait System {
    /// What `$SHELL -lc 'command -v claude'` prints, when it succeeds.
    fn login_shell_claude(&self) -> Option<String>;
    fn home(&self) -> Option<PathBuf>;
    fn is_executable(&self, path: &Path) -> bool;
    /// osascript with `script`, one -e per line, and the folder and the command as its arguments.
    fn osascript(&self, script: &str, folder: &Path, command: &str) -> Result<(), String>;
    /// open -a Terminal <folder>
    fn open_terminal(&self, folder: &Path) -> Result<(), String>;
    /// pbcopy
    fn copy(&self, text: &str) -> Result<(), String>;
    /// Shows the folder in Finder.
    fn reveal(&self, folder: &Path) -> Result<(), String>;
    fn open_url(&self, url: &str);
    fn tell(&self, message: &str);
    /// A message with a button named `yes` and Cancel: whether `yes` was clicked.
    fn ask(&self, message: &str, yes: &str) -> bool;
}

/// Where claude was found: on the login shell's PATH, so the command can say just "claude", or at one of the usual
/// install places, so the command names it in full.
#[derive(Debug, PartialEq)]
struct Claude {
    path: PathBuf,
    on_path: bool,
}

/// The login shell first, then the usual install places.
fn find_claude(sys: &dyn System) -> Option<Claude> {
    let found = sys.login_shell_claude().and_then(|out| out.lines().map(str::trim).filter(|l| !l.is_empty()).last().map(PathBuf::from));
    if let Some(path) = found.filter(|p| p.is_absolute() && sys.is_executable(p)) {
        return Some(Claude { path, on_path: true });
    }
    let home = sys.home();
    let usual = [home.as_ref().map(|h| h.join(".local/bin/claude")), home.as_ref().map(|h| h.join(".claude/local/claude")),
        Some("/opt/homebrew/bin/claude".into()), Some("/usr/local/bin/claude".into())];
    usual.into_iter().flatten().find(|p| sys.is_executable(p)).map(|path| Claude { path, on_path: false })
}

/// A word for the shell: as it is when it holds only safe characters, else in single quotes.
fn shell_word(s: &str) -> String {
    if !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"/._-+".contains(&b)) { return s.to_string(); }
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// The command Terminal runs: claude and the prompt, which is only ever one of the fixed prompts above.
fn command(claude: &Claude, prompt: &str) -> String {
    debug_assert!(prompt.bytes().all(|b| b.is_ascii_alphanumeric() || b" /-".contains(&b)), "{prompt}");
    let program = if claude.on_path { "claude".to_string() } else { shell_word(&claude.path.to_string_lossy()) };
    format!("{program} \"{prompt}\"")
}

/// Whether the workspace at `folder` is still to be set up: its CLAUDE.md has the "Setting up this workspace" section.
/// A new workspace always has it. A CLAUDE.md that can't be read has no section.
pub fn needs_setup(folder: &Path) -> bool {
    std::fs::read_to_string(folder.join("CLAUDE.md")).is_ok_and(|text| text.lines().any(|l| l.trim_end() == SETUP_SECTION))
}

/// Does what the action says, in the workspace at `folder`. The setup runs only in a workspace that is still to be set
/// up; in any other it says so and runs nothing.
pub fn perform(action: &Action, folder: &Path, sys: &dyn System) {
    if *action == Action::Setup && !needs_setup(folder) {
        sys.tell(ALREADY_SET_UP);
        return;
    }
    launch(action, folder, sys);
}

/// Starts Claude Code with the action's prompt in Terminal, or shows the folder.
fn launch(action: &Action, folder: &Path, sys: &dyn System) {
    let Some(prompt) = action.prompt() else {
        if let Err(e) = sys.reveal(folder) { sys.tell(&format!("The workspace could not be shown in Finder: {e}")); }
        return;
    };
    let Some(claude) = find_claude(sys) else {
        if sys.ask(NOT_INSTALLED, OPEN_INSTALL_PAGE) { sys.open_url(INSTALL_PAGE); }
        return;
    };
    let command = command(&claude, &prompt);
    if sys.osascript(TERMINAL_SCRIPT, folder, &command).is_ok() { return; }
    // macOS said no, or osascript failed: Terminal in the folder, and the command to paste.
    match (sys.open_terminal(folder), sys.copy(&command)) {
        (Ok(()), Ok(())) => sys.tell(FALLBACK),
        (Ok(()), Err(_)) => sys.tell(&format!("Terminal is open in your workspace. Type this and press Return:\n\n{command}")),
        (Err(_), _) => sys.tell(&format!("Terminal could not be opened. To start Claude Code, open Terminal and run:\n\ncd {} && {command}", shell_word(&folder.to_string_lossy()))),
    }
}

/// One action at a time, however many times a link is clicked.
static RUNNING: AtomicBool = AtomicBool::new(false);

/// A click on an action: link in the main window. It runs in the open workspace, if one is open and the action is one
/// of the list; anything else does nothing.
pub fn requested(app: &AppHandle, url: &Url) {
    let folder = app.state::<State>().core.read().unwrap().as_ref().map(|c| c.workspace().root().to_path_buf());
    match folder.as_deref().and_then(|f| Action::parse(url.as_str(), f)) {
        Some(action) => start(app, action, folder.unwrap()),
        None => {
            #[cfg(feature = "probe")]
            crate::probe::log(&format!("action refused {}", serde_json::to_string(url.as_str()).unwrap()));
        }
    }
}

/// Runs an action off the main thread: osascript waits for macOS's question, the first time, and the dialogs wait.
pub fn start(app: &AppHandle, action: Action, folder: PathBuf) {
    if RUNNING.swap(true, Ordering::SeqCst) { return; }
    let app = app.clone();
    std::thread::spawn(move || {
        #[cfg(not(feature = "probe"))]
        perform(&action, &folder, &mac::Mac { app: app.clone() });
        // The probe build records what it would do and prints it for tools/check-app.mjs.
        #[cfg(feature = "probe")]
        {
            let recorder = Recorder::probe();
            perform(&action, &folder, &recorder);
            let plan = serde_json::json!({ "action": action.name(), "folder": folder, "steps": recorder.steps() });
            crate::probe::log(&format!("action {plan}"));
            let _ = &app;
        }
        RUNNING.store(false, Ordering::SeqCst);
    });
}

/// The System that does it: osascript, open, pbcopy, the opener plugin and the app's dialogs.
#[cfg_attr(feature = "probe", allow(dead_code))]
mod mac {
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    use tauri::AppHandle;
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult};
    use tauri_plugin_opener::OpenerExt;

    pub struct Mac {
        pub app: AppHandle,
    }

    /// $SHELL (or zsh) as a login shell, so it reads the profile that sets PATH. Given 10 seconds.
    pub fn login_shell_claude() -> Option<String> {
        let shell = std::env::var_os("SHELL").filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/zsh".into());
        let mut child = Command::new(shell).args(["-lc", "command -v claude"])
            .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
        let end = Instant::now() + Duration::from_secs(10);
        loop {
            match child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if Instant::now() < end => std::thread::sleep(Duration::from_millis(50)),
                _ => { let _ = child.kill(); let _ = child.wait(); return None; }
            }
        }
        let out = child.wait_with_output().ok()?;
        out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
    }

    pub fn is_executable(path: &Path) -> bool {
        std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    }

    fn ran(cmd: &mut Command) -> Result<(), String> {
        let out = cmd.stdin(Stdio::null()).output().map_err(|e| e.to_string())?;
        if out.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&out.stderr).trim().to_string()) }
    }

    pub fn osascript(script: &str, folder: &Path, command: &str) -> Result<(), String> {
        let mut cmd = Command::new("/usr/bin/osascript");
        for line in script.lines() { cmd.arg("-e").arg(line); }
        ran(cmd.arg(folder).arg(command))
    }

    pub fn open_terminal(folder: &Path) -> Result<(), String> {
        ran(Command::new("/usr/bin/open").args(["-a", "Terminal"]).arg(folder))
    }

    pub fn copy(text: &str) -> Result<(), String> {
        let mut child = Command::new("/usr/bin/pbcopy").stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null())
            .spawn().map_err(|e| e.to_string())?;
        child.stdin.take().unwrap().write_all(text.as_bytes()).map_err(|e| e.to_string())?;
        let status = child.wait().map_err(|e| e.to_string())?;
        if status.success() { Ok(()) } else { Err(format!("pbcopy exited with {status}")) }
    }

    impl super::System for Mac {
        fn login_shell_claude(&self) -> Option<String> { login_shell_claude() }
        fn home(&self) -> Option<PathBuf> { std::env::var_os("HOME").map(PathBuf::from) }
        fn is_executable(&self, path: &Path) -> bool { is_executable(path) }
        fn osascript(&self, script: &str, folder: &Path, command: &str) -> Result<(), String> { osascript(script, folder, command) }
        fn open_terminal(&self, folder: &Path) -> Result<(), String> { open_terminal(folder) }
        fn copy(&self, text: &str) -> Result<(), String> { copy(text) }
        fn reveal(&self, folder: &Path) -> Result<(), String> {
            self.app.opener().open_path(folder.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
        }
        fn open_url(&self, url: &str) { let _ = self.app.opener().open_url(url, None::<&str>); }
        fn tell(&self, message: &str) { crate::workspace::tell(&self.app, MessageDialogKind::Info, message); }
        fn ask(&self, message: &str, yes: &str) -> bool {
            let mut dialog = self.app.dialog().message(message).title(&self.app.package_info().name).kind(MessageDialogKind::Warning)
                .buttons(MessageDialogButtons::OkCancelCustom(yes.into(), "Cancel".into()));
            if let Some(w) = crate::workspace::front(&self.app) { dialog = dialog.parent(&w); }
            matches!(dialog.blocking_show_with_result(), MessageDialogResult::Custom(ref label) if label == yes)
        }
    }
}

/// A System that records each step instead of taking it, and answers as it is told.
#[cfg(any(test, feature = "probe"))]
pub struct Recorder {
    /// What the login shell prints for `command -v claude`.
    pub shell: Option<String>,
    pub home: Option<PathBuf>,
    pub executables: Vec<PathBuf>,
    pub osascript_ok: bool,
    pub open_ok: bool,
    pub copy_ok: bool,
    /// The button clicked in a message that asks.
    pub answer: bool,
    steps: std::sync::Mutex<Vec<serde_json::Value>>,
}

#[cfg(any(test, feature = "probe"))]
impl Recorder {
    pub fn new() -> Recorder {
        Recorder { shell: None, home: Some("/home/someone".into()), executables: Vec::new(), osascript_ok: true, open_ok: true,
            copy_ok: true, answer: false, steps: Default::default() }
    }

    /// For the probe build: claude on the login shell's PATH, and osascript succeeds.
    #[cfg(feature = "probe")]
    pub fn probe() -> Recorder {
        Recorder { shell: Some("/usr/local/bin/claude\n".into()), executables: vec!["/usr/local/bin/claude".into()], ..Recorder::new() }
    }

    pub fn steps(&self) -> Vec<serde_json::Value> {
        self.steps.lock().unwrap().clone()
    }

    fn record(&self, step: serde_json::Value) {
        self.steps.lock().unwrap().push(step);
    }
}

#[cfg(any(test, feature = "probe"))]
impl System for Recorder {
    fn login_shell_claude(&self) -> Option<String> { self.shell.clone() }
    fn home(&self) -> Option<PathBuf> { self.home.clone() }
    fn is_executable(&self, path: &Path) -> bool { self.executables.iter().any(|p| p == path) }
    fn osascript(&self, script: &str, folder: &Path, command: &str) -> Result<(), String> {
        self.record(serde_json::json!({ "osascript": { "script": script, "args": [folder, command] } }));
        if self.osascript_ok { Ok(()) } else { Err("Not authorized to send Apple events to Terminal. (-1743)".into()) }
    }
    fn open_terminal(&self, folder: &Path) -> Result<(), String> {
        self.record(serde_json::json!({ "open": ["-a", "Terminal", folder] }));
        if self.open_ok { Ok(()) } else { Err("open failed".into()) }
    }
    fn copy(&self, text: &str) -> Result<(), String> {
        self.record(serde_json::json!({ "copy": text }));
        if self.copy_ok { Ok(()) } else { Err("pbcopy failed".into()) }
    }
    fn reveal(&self, folder: &Path) -> Result<(), String> {
        self.record(serde_json::json!({ "reveal": folder }));
        Ok(())
    }
    fn open_url(&self, url: &str) { self.record(serde_json::json!({ "open-url": url })); }
    fn tell(&self, message: &str) { self.record(serde_json::json!({ "tell": message })); }
    fn ask(&self, message: &str, yes: &str) -> bool {
        self.record(serde_json::json!({ "ask": message, "button": yes }));
        self.answer
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mc-actions-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn repo(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(name)
    }

    fn found() -> Recorder {
        Recorder { shell: Some("/opt/homebrew/bin/claude\n".into()), executables: vec!["/opt/homebrew/bin/claude".into()], ..Recorder::new() }
    }

    /// How an action starts Claude Code, past the setup's check: the folders here needn't be there.
    fn run(action: &Action, folder: &Path, sys: &Recorder) -> Vec<serde_json::Value> {
        launch(action, folder, sys);
        sys.steps()
    }

    fn performed(action: &Action, folder: &Path, sys: &Recorder) -> Vec<serde_json::Value> {
        perform(action, folder, sys);
        sys.steps()
    }

    #[test]
    fn the_four_actions_and_nothing_else() {
        let ws = repo("sample-workspace");
        assert_eq!(Action::parse("action:setup", &ws), Some(Action::Setup));
        assert_eq!(Action::parse("action:review", &ws), Some(Action::Review));
        assert_eq!(Action::parse("action:open-folder", &ws), Some(Action::OpenFolder));
        for agent in ["blind-spot-check", "commitment-tracker", "negotiation-prep", "one-on-one-prep", "risk-radar"] {
            assert_eq!(Action::parse(&format!("action:agent:{agent}"), &ws), Some(Action::Agent(agent.into())), "{agent}");
        }
        for name in ["setup", "review", "open-folder", "agent:risk-radar"] {
            assert_eq!(Action::parse(&format!("action:{name}"), &ws).map(|a| a.name()).as_deref(), Some(name));
        }
        for address in ["", "setup", "action:", "action:Setup", "action:setup ", " action:setup", "action:setup?x=1", "action:setup#x",
            "action:review-transcript", "action:open", "action:rm -rf", "ACTION:setup", "mc://localhost/action/setup", "action:agent:",
            "action:agent:Blind-spot-check", "action:agent:blind_spot_check", "action:agent:blind-spot-check.md", "action:agent:../agents/risk-radar",
            "action:agent:risk-radar/", "action:agent:risk%2Dradar", "action:agent:no-such-agent", "action:agent:risk-radar;ls",
            "action:agent:risk-radar agent", "action:agents:risk-radar", "action:agent:agent:risk-radar"] {
            assert_eq!(Action::parse(address, &ws), None, "{address:?}");
        }
    }

    #[test]
    fn an_agent_needs_its_file_in_the_open_workspace() {
        let dir = scratch("agent-file");
        assert_eq!(Action::parse("action:agent:risk-radar", &dir), None);
        fs::create_dir_all(dir.join(".claude/agents/risk-radar.md")).unwrap();
        // A folder by that name is not an agent.
        assert_eq!(Action::parse("action:agent:risk-radar", &dir), None);
        fs::write(dir.join(".claude/agents/my-agent-2.md"), "").unwrap();
        assert_eq!(Action::parse("action:agent:my-agent-2", &dir), Some(Action::Agent("my-agent-2".into())));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn setup_review_and_an_agent_open_terminal_in_the_workspace_with_their_command() {
        let ws = Path::new("/home/someone/My Workspace");
        for (action, command) in [(Action::Setup, r#"claude "Set up my workspace""#), (Action::Review, r#"claude "/review-transcript""#),
            (Action::Agent("risk-radar".into()), r#"claude "Use the risk-radar agent""#)] {
            assert_eq!(run(&action, ws, &found()), [json!({ "osascript": { "script": TERMINAL_SCRIPT, "args": [ws, command] } })], "{action:?}");
        }
    }

    #[test]
    fn the_script_takes_the_folder_and_the_command_as_arguments() {
        assert!(TERMINAL_SCRIPT.starts_with("on run argv\n") && TERMINAL_SCRIPT.ends_with("\nend run"));
        assert!(TERMINAL_SCRIPT.contains("set folderPath to item 1 of argv\n") && TERMINAL_SCRIPT.contains("set shellCommand to item 2 of argv\n"));
        assert!(TERMINAL_SCRIPT.contains("\"cd \" & quoted form of folderPath & \" && \" & shellCommand"));
        // A folder with quotes, a "$" and a newline goes in as it is, as an argument; the script's text is always the same.
        let ws = Path::new("/home/someone/Kevin's \"$(touch x)\"\nfolder");
        let steps = run(&Action::Setup, ws, &found());
        assert_eq!(steps[0]["osascript"]["script"], TERMINAL_SCRIPT);
        assert_eq!(steps[0]["osascript"]["args"][0], ws.to_str().unwrap());
    }

    #[test]
    fn claude_is_looked_for_in_the_login_shell_then_the_usual_places() {
        let ws = Path::new("/ws");
        let command = |sys: &Recorder| run(&Action::Setup, ws, sys)[0]["osascript"]["args"][1].as_str().unwrap().to_string();
        // Found by the login shell: just "claude". The last line counts, so a profile that prints something is fine.
        let shell = Recorder { shell: Some("Welcome!\n/home/someone/.npm/bin/claude\n".into()), executables: vec!["/home/someone/.npm/bin/claude".into()], ..Recorder::new() };
        assert_eq!(command(&shell), r#"claude "Set up my workspace""#);
        // Elsewhere: named in full, in the order given.
        let order = ["/home/someone/.local/bin/claude", "/home/someone/.claude/local/claude", "/opt/homebrew/bin/claude", "/usr/local/bin/claude"];
        for (i, path) in order.iter().enumerate() {
            let sys = Recorder { executables: order[i..].iter().map(PathBuf::from).collect(), ..Recorder::new() };
            assert_eq!(command(&sys), format!(r#"{path} "Set up my workspace""#), "{path}");
        }
        // An alias, a name or a path that isn't executable is not claude.
        for out in ["alias claude=/home/someone/.claude/local/claude", "claude", "/nowhere/claude", ""] {
            let sys = Recorder { shell: Some(out.into()), executables: vec!["/usr/local/bin/claude".into()], ..Recorder::new() };
            assert_eq!(command(&sys), r#"/usr/local/bin/claude "Set up my workspace""#, "{out}");
        }
        // A home folder with a space or a quote is quoted for the shell.
        let sys = Recorder { home: Some("/home/Kevin O'Hara".into()), executables: vec!["/home/Kevin O'Hara/.local/bin/claude".into()], ..Recorder::new() };
        assert_eq!(command(&sys), r#"'/home/Kevin O'\''Hara/.local/bin/claude' "Set up my workspace""#);
    }

    #[test]
    fn without_claude_it_says_so_and_offers_the_install_page() {
        let ws = Path::new("/ws");
        let declined = Recorder::new();
        assert_eq!(run(&Action::Review, ws, &declined), [json!({ "ask": NOT_INSTALLED, "button": OPEN_INSTALL_PAGE })]);
        let accepted = Recorder { answer: true, ..Recorder::new() };
        assert_eq!(run(&Action::Review, ws, &accepted), [json!({ "ask": NOT_INSTALLED, "button": OPEN_INSTALL_PAGE }), json!({ "open-url": INSTALL_PAGE })]);
        assert!(NOT_INSTALLED.starts_with("Claude Code isn't installed\n"));
    }

    #[test]
    fn if_osascript_fails_terminal_opens_in_the_folder_and_the_command_is_copied() {
        let ws = Path::new("/home/someone/ws");
        let sys = Recorder { osascript_ok: false, ..found() };
        let steps = run(&Action::Setup, ws, &sys);
        assert_eq!(steps[1..], [json!({ "open": ["-a", "Terminal", ws] }), json!({ "copy": r#"claude "Set up my workspace""# }), json!({ "tell": FALLBACK })]);
        assert_eq!(FALLBACK, "Terminal is open in your workspace. The command is copied: paste it and press Return.");
        // If the clipboard or Terminal fails too, the message gives the command.
        let no_copy = Recorder { osascript_ok: false, copy_ok: false, ..found() };
        assert_eq!(run(&Action::Setup, ws, &no_copy)[3], json!({ "tell": "Terminal is open in your workspace. Type this and press Return:\n\nclaude \"Set up my workspace\"" }));
        let no_open = Recorder { osascript_ok: false, open_ok: false, ..found() };
        assert_eq!(run(&Action::Setup, Path::new("/home/someone/My ws"), &no_open)[3],
            json!({ "tell": "Terminal could not be opened. To start Claude Code, open Terminal and run:\n\ncd '/home/someone/My ws' && claude \"Set up my workspace\"" }));
    }

    #[test]
    fn setup_in_the_sample_says_it_is_already_set_up_and_runs_nothing() {
        let ws = repo("sample-workspace");
        assert!(!fs::read_to_string(ws.join("CLAUDE.md")).unwrap().contains(SETUP_SECTION));
        assert_eq!(performed(&Action::Setup, &ws, &found()), [json!({ "tell": ALREADY_SET_UP })]);
        assert!(ALREADY_SET_UP.starts_with("This workspace is already set up\n"));
        // Only the setup is refused: the review and an agent still run there.
        assert_eq!(performed(&Action::Review, &ws, &found()), run(&Action::Review, &ws, &found()));
        assert_eq!(performed(&Action::Agent("risk-radar".into()), &ws, &found())[0]["osascript"]["args"][1], r#"claude "Use the risk-radar agent""#);
    }

    #[test]
    fn setup_in_a_new_starter_runs() {
        let dir = scratch("new-starter");
        let ws = dir.join("My Workspace");
        crate::workspace::copy_new_folder(&repo("starter-workspace"), &ws).unwrap();
        assert!(needs_setup(&ws));
        assert_eq!(performed(&Action::Setup, &ws, &found()), [json!({ "osascript": { "script": TERMINAL_SCRIPT, "args": [ws, r#"claude "Set up my workspace""#] } })]);
        // Once the coach has deleted the section, it is set up.
        let claude = ws.join("CLAUDE.md");
        let text = fs::read_to_string(&claude).unwrap();
        let start = text.find(SETUP_SECTION).unwrap();
        let end = start + text[start..].find("\n## Notes between meetings").unwrap() + 1;
        fs::write(&claude, format!("{}{}", &text[..start], &text[end..])).unwrap();
        assert_eq!(performed(&Action::Setup, &ws, &found()), [json!({ "tell": ALREADY_SET_UP })]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_setup_section_is_found_only_as_its_own_heading() {
        let dir = scratch("section");
        assert!(!needs_setup(&dir), "no CLAUDE.md");
        for (text, wanted) in [("# Coach\n\n## Setting up this workspace\nAsk.\n", true), ("## Setting up this workspace  \r\n", true),
            ("Then delete this \"Setting up this workspace\" section.\n", false), ("### Setting up this workspace\n", false),
            ("## Setting up this workspace later\n", false), ("", false)] {
            fs::write(dir.join("CLAUDE.md"), text).unwrap();
            assert_eq!(needs_setup(&dir), wanted, "{text:?}");
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn open_folder_shows_the_workspace_and_needs_no_claude() {
        let ws = Path::new("/home/someone/ws");
        assert_eq!(run(&Action::OpenFolder, ws, &Recorder::new()), [json!({ "reveal": ws })]);
    }

    #[test]
    fn every_action_link_in_help_md_is_one_of_the_list() {
        let help = fs::read_to_string(repo("help.md")).unwrap();
        let links: Vec<&str> = help.match_indices("](action:").map(|(i, _)| { let rest = &help[i + 2..]; &rest[..rest.find(')').unwrap()] }).collect();
        assert!(links.contains(&"action:setup") && links.contains(&"action:review"), "{links:?}");
        for link in links { assert!(Action::parse(link, &repo("sample-workspace")).is_some(), "{link}"); }
    }

    /// The one manual try: `cargo test -p chief-of-staff-app -- --ignored manual_setup` with MC_MANUAL_WORKSPACE set to a
    /// new workspace from File > New Workspace…, which is still to be set up. It really runs osascript (and, if that
    /// fails, open and pbcopy); messages are printed.
    #[test]
    #[ignore]
    fn manual_setup() {
        struct Manual;
        impl System for Manual {
            fn login_shell_claude(&self) -> Option<String> { mac::login_shell_claude() }
            fn home(&self) -> Option<PathBuf> { std::env::var_os("HOME").map(PathBuf::from) }
            fn is_executable(&self, path: &Path) -> bool { mac::is_executable(path) }
            fn osascript(&self, script: &str, folder: &Path, command: &str) -> Result<(), String> {
                let r = mac::osascript(script, folder, command);
                eprintln!("osascript {folder:?} {command:?}: {r:?}");
                r
            }
            fn open_terminal(&self, folder: &Path) -> Result<(), String> { mac::open_terminal(folder) }
            fn copy(&self, text: &str) -> Result<(), String> { mac::copy(text) }
            fn reveal(&self, _: &Path) -> Result<(), String> { Ok(()) }
            fn open_url(&self, url: &str) { eprintln!("open-url {url}"); }
            fn tell(&self, message: &str) { eprintln!("tell: {message}"); }
            fn ask(&self, message: &str, _: &str) -> bool { eprintln!("ask: {message}"); false }
        }
        let folder = PathBuf::from(std::env::var_os("MC_MANUAL_WORKSPACE").expect("MC_MANUAL_WORKSPACE"));
        assert!(needs_setup(&folder), "a new workspace, still to be set up");
        perform(&Action::Setup, &folder, &Manual);
    }
}
