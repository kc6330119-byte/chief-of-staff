// Choosing the workspace folder and opening it in the window (SPEC.md, decisions 28, 30 and 57).
// The dialogs wait for an answer, so they run off the main thread.
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use chief_of_staff_core::{Core, Policy, Workspace};
use tauri::path::BaseDirectory;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult};
use tauri_plugin_opener::OpenerExt;

use crate::{settings, State, ORIGIN, SCHEME, WINDOW};

const WELCOME: &str = "welcome";

/// One folder choice at a time, however many times a button or menu item is clicked.
static CHOOSING: AtomicBool = AtomicBool::new(false);

/// On launch: the remembered folder if it is still there, otherwise the welcome window.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        #[cfg(feature = "probe")]
        if let Some(folder) = crate::probe::workspace() {
            open(&app, folder);
            return;
        }
        match settings::load(&app) {
            Some(folder) if folder.is_dir() => open(&app, folder),
            Some(folder) => show_welcome(&app, Some(&folder)),
            None => show_welcome(&app, None),
        }
    });
}

/// The welcome window shows public/welcome.html, served by the core like the other pages. Its four
/// buttons are plain links to /welcome/choose, /welcome/new, /welcome/sample and /welcome/quit; this window
/// catches those addresses before they load, so the page needs no app permissions and runs no app code.
fn show_welcome(app: &AppHandle, missing: Option<&Path>) {
    let mut url: Url = format!("{ORIGIN}/welcome.html").parse().unwrap();
    // The folder as the main window's title shows it, with the home folder as "~".
    if let Some(folder) = missing { url.query_pairs_mut().append_pair("missing", &shown(folder)); }
    let actions = app.clone();
    let builder = WebviewWindowBuilder::new(app, WELCOME, WebviewUrl::CustomProtocol(url))
        .title(app.package_info().name.clone())
        .inner_size(660.0, 440.0)
        .resizable(false)
        .center()
        .incognito(true)
        .disable_drag_drop_handler()
        .on_navigation(move |url| welcome_link(&actions, url))
        .on_new_window(|_, _| NewWindowResponse::Deny);
    #[cfg(feature = "probe")]
    let builder = builder.on_page_load(crate::probe::on_page_load);
    if let Err(e) = builder.build() {
        tell(app, MessageDialogKind::Error, &format!("The window could not be opened: {e}"));
        app.exit(1);
    }
}

fn welcome_link(app: &AppHandle, url: &Url) -> bool {
    if url.scheme() != SCHEME || url.host_str() != Some("localhost") { return false; }
    match url.path() {
        "/welcome.html" => true,
        "/welcome/choose" => { choose_then_open(app, pick_folder, None); false }
        "/welcome/new" => { choose_then_open(app, create_workspace, Some(NEW_WORKSPACE_READY)); false }
        "/welcome/sample" => { choose_then_open(app, copy_sample, None); false }
        "/welcome/quit" => { app.exit(0); false }
        _ => false,
    }
}

/// Runs a folder choice off the main thread and opens what was chosen, then shows `then` if there is one.
/// Cancelling leaves things as they were.
fn choose_then_open(app: &AppHandle, choose: fn(&AppHandle) -> Option<PathBuf>, then: Option<&'static str>) {
    if CHOOSING.swap(true, Ordering::SeqCst) { return; }
    let app = app.clone();
    std::thread::spawn(move || {
        if let Some(folder) = choose(&app) {
            open(&app, folder);
            if let Some(message) = then { tell(&app, MessageDialogKind::Info, message); }
        }
        CHOOSING.store(false, Ordering::SeqCst);
    });
}

pub fn choose_from_menu(app: AppHandle) {
    choose_then_open(&app, pick_folder, None);
}

pub fn new_from_menu(app: AppHandle) {
    choose_then_open(&app, create_workspace, Some(NEW_WORKSPACE_READY));
}

pub fn open_sample_from_menu(app: AppHandle) {
    choose_then_open(&app, copy_sample, None);
}

/// Shown once a new workspace is open: the coach's first-run section in its CLAUDE.md does the rest.
const NEW_WORKSPACE_READY: &str = "Your new workspace is ready. In Terminal, open Claude Code in this folder and type: Set up my workspace";

/// The window a dialog belongs to, so it opens as a sheet on that window.
fn front(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(WINDOW).or_else(|| app.get_webview_window(WELCOME))
}

fn tell(app: &AppHandle, kind: MessageDialogKind, message: &str) {
    let mut dialog = app.dialog().message(message).kind(kind).title(&app.package_info().name);
    if let Some(w) = front(app) { dialog = dialog.parent(&w); }
    dialog.blocking_show();
}

/// A folder with none of the files the app reads is probably the wrong one; a change on the Board would
/// create actions/ledger.json there, and a note notes/notes.json, so ask first.
fn looks_like_workspace(folder: &Path) -> bool {
    ["meeting-notes", "CLAUDE.md", "library/books.json", ".claude/agents", "corrections/corrections.json", "actions/ledger.json", "notes/notes.json"]
        .iter().any(|p| folder.join(p).exists())
}

fn pick_folder(app: &AppHandle) -> Option<PathBuf> {
    #[cfg(feature = "probe")]
    if let Some(folder) = crate::probe::picked_folder() { return Some(folder); }
    let mut picker = app.dialog().file().set_title("Choose your workspace folder").set_can_create_directories(false);
    if let Some(w) = front(app) { picker = picker.set_parent(&w); }
    let folder = picker.blocking_pick_folder()?.into_path().ok()?;
    if looks_like_workspace(&folder) { return Some(folder); }
    let (message, buttons) = not_a_workspace_warning(&folder);
    let mut warning = app.dialog().message(message).title(&app.package_info().name).kind(MessageDialogKind::Warning).buttons(buttons);
    if let Some(w) = front(app) { warning = warning.parent(&w); }
    let answer = warning.blocking_show_with_result();
    matches!(answer, MessageDialogResult::Custom(ref label) if label == USE_FOLDER).then_some(folder)
}

const USE_FOLDER: &str = "Use This Folder";

/// The warning for a folder with none of the workspace files. "Cancel" is the first button, so Return
/// (the first button) and Escape (the button titled Cancel) both cancel; "Use This Folder" takes a click.
fn not_a_workspace_warning(folder: &Path) -> (String, MessageDialogButtons) {
    let message = format!(
        "{}\n\nThis folder has no meeting-notes, CLAUDE.md, library or corrections, so it may not be a Chief of Staff for Managers workspace. The first change on the Board would create actions/ledger.json in it.\n\nOpen Sample… gives you a working example to try first.",
        shown(folder),
    );
    (message, MessageDialogButtons::OkCancelCustom("Cancel".into(), USE_FOLDER.into()))
}

/// A file or folder that ships inside the app: the sample workspace, the starter workspace and help.md. In a
/// development build, also the copy in the repository; that path is not compiled into a release build.
fn bundled(app: &AppHandle, name: &str) -> Option<PathBuf> {
    if let Ok(p) = app.path().resolve(name, BaseDirectory::Resource) {
        if p.exists() { return Some(p); }
    }
    #[cfg(debug_assertions)]
    {
        let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(name);
        if dev.exists() { return Some(dev); }
    }
    None
}

/// A workspace that ships inside the app and is copied to a new folder: what the save panel and the messages say.
struct Bundled {
    source: &'static str,
    title: &'static str,
    /// The folder name offered, after the app's name.
    name: &'static str,
    missing: &'static str,
    /// Why nothing was copied over an existing file or folder.
    never_replaces: &'static str,
    failed: &'static str,
}

const SAMPLE: Bundled = Bundled {
    source: "sample-workspace",
    title: "Save a copy of the sample workspace",
    name: "Sample",
    missing: "The sample workspace is missing from the app.",
    never_replaces: "The sample never replaces a file or folder.",
    failed: "The sample could not be copied to",
};

/// The starter workspace: the coach, the agents, the template, the book notes and a people.md with one row for
/// the manager, ready for "Set up my workspace".
const STARTER: Bundled = Bundled {
    source: "starter-workspace",
    title: "Create a new workspace",
    name: "Workspace",
    missing: "The starter workspace is missing from the app.",
    never_replaces: "A new workspace never replaces a file or folder.",
    failed: "The new workspace could not be created in",
};

fn copy_sample(app: &AppHandle) -> Option<PathBuf> {
    copy_bundled(app, &SAMPLE)
}

fn create_workspace(app: &AppHandle) -> Option<PathBuf> {
    copy_bundled(app, &STARTER)
}

/// Copies a workspace that ships inside the app to a new folder the person names. An existing file or folder is
/// never replaced, even if the save panel asked "Replace?" and the answer was yes.
fn copy_bundled(app: &AppHandle, copy: &Bundled) -> Option<PathBuf> {
    let Some(source) = bundled(app, copy.source).filter(|p| p.is_dir()) else {
        tell(app, MessageDialogKind::Error, copy.missing);
        return None;
    };
    let mut panel = app.dialog().file().set_title(copy.title)
        .set_file_name(format!("{} {}", app.package_info().name, copy.name)).set_can_create_directories(true);
    if let Some(w) = front(app) { panel = panel.set_parent(&w); }
    let target = panel.blocking_save_file()?.into_path().ok()?;
    if target.exists() {
        tell(app, MessageDialogKind::Warning, &format!("Nothing was copied, because this already exists:\n\n{}\n\n{} Choose a new name.", target.display(), copy.never_replaces));
        return None;
    }
    if let Err(e) = copy_new_folder(&source, &target) {
        tell(app, MessageDialogKind::Error, &format!("{} {}: {e}", copy.failed, target.display()));
        return None;
    }
    Some(target)
}

/// The Help page's text. The app runs without it; #/help then says it is missing.
fn help_text(app: &AppHandle) -> Option<String> {
    fs::read_to_string(bundled(app, "help.md")?).ok()
}

/// Copies a folder to a path that must not exist yet; on failure, removes only what it created.
fn copy_new_folder(source: &Path, target: &Path) -> io::Result<()> {
    fs::create_dir(target)?; // fails if anything is already there
    let copied = copy_contents(source, target);
    if copied.is_err() { let _ = fs::remove_dir_all(target); }
    copied
}

fn copy_contents(source: &Path, target: &Path) -> io::Result<()> {
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let to = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            fs::create_dir(&to)?;
            copy_contents(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

/// The folder as a person reads it, with the home folder shown as "~".
fn shown(folder: &Path) -> String {
    match std::env::var_os("HOME").map(PathBuf::from) {
        Some(home) if folder.starts_with(&home) => format!("~/{}", folder.strip_prefix(&home).unwrap().display()),
        _ => folder.display().to_string(),
    }
}

/// Opens a workspace: a new core for it, remembered in the settings file, shown in the window title.
pub fn open(app: &AppHandle, folder: PathBuf) {
    let core = Core::new(Workspace::new(&folder), Policy::app_scheme(ORIGIN), |line| eprintln!("{line}")).with_help(help_text(app));
    *app.state::<State>().core.write().unwrap() = Some(Arc::new(core));
    if let Err(e) = settings::save(app, &folder) {
        tell(app, MessageDialogKind::Warning, &format!("The workspace is open, but it could not be remembered for next time: {e}"));
    }
    let title = format!("{} — {}", app.package_info().name, shown(&folder));
    let home: Url = format!("{ORIGIN}/").parse().unwrap();
    if let Some(window) = app.get_webview_window(WINDOW) {
        let _ = window.set_title(&title);
        let _ = window.navigate(home);
        close_welcome(app);
        return;
    }
    let (nav, popup) = (app.clone(), app.clone());
    let builder = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::CustomProtocol(home))
        .title(title)
        .inner_size(1440.0, 900.0)
        .min_inner_size(960.0, 640.0)
        // WebKit keeps no cookies, storage or cache on disk for this window.
        .incognito(true)
        // Drags inside the page (the Board) stay with the page; files dropped on the window do nothing.
        .disable_drag_drop_handler()
        .on_navigation(move |url| allow_navigation(&nav, url))
        .on_new_window(move |url, _| { allow_navigation(&popup, &url); NewWindowResponse::Deny });
    #[cfg(feature = "probe")]
    let builder = builder.on_page_load(crate::probe::on_page_load);
    if let Err(e) = builder.build() {
        tell(app, MessageDialogKind::Error, &format!("The window could not be opened: {e}"));
        app.exit(1);
    }
    close_welcome(app);
}

/// The welcome window closes once the main window is open, so closing it never ends the app.
fn close_welcome(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(WELCOME) { let _ = w.close(); }
}

/// The window only ever shows the app's own pages. Web links open in the default browser; anything
/// else (mailto:, file:, other schemes) does nothing.
fn allow_navigation(app: &AppHandle, url: &Url) -> bool {
    match url.scheme() {
        s if s == SCHEME && url.host_str() == Some("localhost") => true,
        "http" | "https" => {
            let _ = app.opener().open_url(url.as_str(), None::<&str>);
            #[cfg(feature = "probe")]
            crate::probe::log(&format!("opened in the browser: {url}"));
            false
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mc-app-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_sample_copy_never_replaces_anything() {
        let dir = scratch("copy");
        let source = dir.join("sample");
        fs::create_dir_all(source.join(".claude/agents")).unwrap();
        fs::write(source.join(".sample-workspace"), "marker").unwrap();
        fs::write(source.join(".claude/agents/a.md"), "agent").unwrap();
        fs::write(source.join("CLAUDE.md"), "coach").unwrap();

        let target = dir.join("copy");
        copy_new_folder(&source, &target).unwrap();
        assert_eq!(fs::read_to_string(target.join(".sample-workspace")).unwrap(), "marker");
        assert_eq!(fs::read_to_string(target.join(".claude/agents/a.md")).unwrap(), "agent");

        // An existing folder is left exactly as it was.
        fs::write(target.join("CLAUDE.md"), "mine").unwrap();
        assert!(copy_new_folder(&source, &target).is_err());
        assert_eq!(fs::read_to_string(target.join("CLAUDE.md")).unwrap(), "mine");
        // So is an existing file.
        let file = dir.join("a-file");
        fs::write(&file, "keep").unwrap();
        assert!(copy_new_folder(&source, &file).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "keep");
        fs::remove_dir_all(&dir).unwrap();
    }

    fn starter() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(STARTER.source)
    }

    #[test]
    fn a_new_workspace_never_replaces_anything() {
        let dir = scratch("new");
        let target = dir.join("My Workspace");
        copy_new_folder(&starter(), &target).unwrap();
        assert_eq!(fs::read_to_string(target.join("people.md")).unwrap(), fs::read_to_string(starter().join("people.md")).unwrap());
        assert!(target.join(".claude/agents").is_dir());

        // An existing folder is left exactly as it was, and nothing is added to it.
        fs::write(target.join("people.md"), "mine").unwrap();
        fs::remove_file(target.join("CLAUDE.md")).unwrap();
        assert!(copy_new_folder(&starter(), &target).is_err());
        assert_eq!(fs::read_to_string(target.join("people.md")).unwrap(), "mine");
        assert!(!target.join("CLAUDE.md").exists());
        // So is an existing file.
        let file = dir.join("a-file");
        fs::write(&file, "keep").unwrap();
        assert!(copy_new_folder(&starter(), &file).is_err());
        assert_eq!(fs::read_to_string(&file).unwrap(), "keep");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_new_workspace_is_not_the_sample() {
        let dir = scratch("not-sample");
        let target = dir.join("My Workspace");
        copy_new_folder(&starter(), &target).unwrap();
        // Without the marker, the "Recreated demo data" badge stays off and ages count to today.
        assert!(!target.join(chief_of_staff_core::SAMPLE_MARKER).exists());
        let core = Core::new(Workspace::new(&target), Policy::app_scheme(ORIGIN), |_| {});
        assert!(!core.demo());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_new_workspace_keeps_the_read_me_in_each_empty_folder() {
        let dir = scratch("readme");
        let target = dir.join("My Workspace");
        copy_new_folder(&starter(), &target).unwrap();
        for folder in ["goals", "meeting-notes", "transcripts"] {
            let names: Vec<String> = fs::read_dir(target.join(folder)).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().into_owned()).collect();
            assert_eq!(names, ["README.txt"], "{folder}");
            let rel = format!("{folder}/README.txt");
            assert_eq!(fs::read_to_string(target.join(&rel)).unwrap(), fs::read_to_string(starter().join(&rel)).unwrap(), "{rel}");
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_warning_shows_the_folder_with_a_tilde_cancels_by_default_and_points_to_the_sample() {
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let (message, buttons) = not_a_workspace_warning(&home.join("Documents").join("Notes"));
        assert!(message.starts_with("~/Documents/Notes\n"), "{message}");
        assert!(!message.contains(&*home.to_string_lossy()), "{message}");
        assert_eq!(message.matches("Open Sample…").count(), 1, "{message}");
        // The Board writes nothing when it opens; the first change creates the ledger.
        assert!(message.contains("actions/ledger.json"), "{message}");
        assert!(!message.contains("board.json"), "{message}");
        assert!(matches!(buttons, MessageDialogButtons::OkCancelCustom(ref first, ref second) if first == "Cancel" && second == USE_FOLDER));
    }

    #[test]
    fn a_folder_without_workspace_files_needs_a_second_look() {
        let dir = scratch("sniff");
        assert!(!looks_like_workspace(&dir));
        fs::create_dir_all(dir.join("meeting-notes")).unwrap();
        assert!(looks_like_workspace(&dir));
        fs::remove_dir_all(&dir).unwrap();
    }
}
