// Only built with `--features probe`, for tools/check-app.mjs. Never part of a normal build.
//
// MC_PROBE_WORKSPACE  open this folder at launch, through the same code as the folder picker
// MC_PROBE_PICK       the folder "chosen" when the welcome window's Choose Folder… is clicked
// MC_PROBE            a script run in the window after every page load; it drives the pages like a person
//                     would and reports by requesting /__probe/<what>, which the core answers 404 and
//                     this file prints. /__probe/done ends the app. /__probe/menu prints the File menu's items, and
//                     /__probe/show-file-menu opens the File menu over the window for a screenshot.
use std::path::PathBuf;

use tauri::menu::{MenuItemKind, Submenu};
use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{AppHandle, Manager, WebviewWindow, Wry};

pub fn workspace() -> Option<PathBuf> {
    std::env::var_os("MC_PROBE_WORKSPACE").map(PathBuf::from)
}

pub fn picked_folder() -> Option<PathBuf> {
    std::env::var_os("MC_PROBE_PICK").map(PathBuf::from)
}

pub fn log(line: &str) {
    eprintln!("[probe] {line}");
}

pub fn on_page_load(window: WebviewWindow, payload: PageLoadPayload<'_>) {
    if payload.event() != PageLoadEvent::Finished { return; }
    if let Some(path) = std::env::var_os("MC_PROBE") {
        match std::fs::read_to_string(&path) {
            Ok(script) => { let _ = window.eval(script); }
            Err(e) => log(&format!("could not read the probe script: {e}")),
        }
    }
}

pub fn log_request(app: &AppHandle, method: &str, target: &str, headers: &[(String, String)], status: u16) {
    let header = |n: &str| headers.iter().find(|(k, _)| k == n).map(|(_, v)| v.as_str()).unwrap_or("-");
    log(&format!("{method} {target} -> {status} origin={} host={} type={}", header("origin"), header("host"), header("content-type")));
    // /__probe/resize?[width,height] (as JSON, encoded): the window's inner size, for the layout checks.
    if let Some(query) = target.strip_prefix("/__probe/resize?") {
        let decoded = query.replace("%5B", "[").replace("%5D", "]").replace("%2C", ",");
        let size: Vec<f64> = decoded.trim_matches(|c| c == '[' || c == ']').split(',').filter_map(|n| n.trim().parse().ok()).collect();
        if let (Some(&w), Some(&h), Some(window)) = (size.first(), size.get(1), app.get_webview_window(crate::WINDOW)) {
            let _ = window.set_size(tauri::LogicalSize::new(w, h));
        }
    }
    // The File menu as the app built it: "file-menu" and its items' names as JSON, separators as "".
    if target.starts_with("/__probe/menu") {
        let items: Vec<String> = file_menu(app).and_then(|f| f.items().ok()).unwrap_or_default().iter().map(label).collect();
        log(&format!("file-menu {}", serde_json::to_string(&items).unwrap()));
    }
    // The File menu, opened as a menu over the window's top left corner. It stays open, holding the app's main
    // thread, until the app is ended; check-app.mjs takes its screenshot after "file-menu-shown", then ends it.
    if target.starts_with("/__probe/show-file-menu") {
        if let (Some(file), Some(window)) = (file_menu(app), app.get_webview_window(crate::WINDOW)) {
            log("file-menu-shown");
            if let Err(e) = window.popup_menu_at(&file, tauri::LogicalPosition::new(24.0, 24.0)) { log(&format!("the File menu could not be shown: {e}")); }
        }
    }
    if target.starts_with("/__probe/done") {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            app.exit(0);
        });
    }
}

fn file_menu(app: &AppHandle) -> Option<Submenu<Wry>> {
    app.menu()?.items().ok()?.into_iter().find_map(|item| match item {
        MenuItemKind::Submenu(s) if s.text().is_ok_and(|t| t == "File") => Some(s),
        _ => None,
    })
}

fn label(item: &MenuItemKind<Wry>) -> String {
    match item {
        MenuItemKind::MenuItem(i) => i.text(),
        MenuItemKind::Submenu(i) => i.text(),
        MenuItemKind::Predefined(i) => i.text(),
        MenuItemKind::Check(i) => i.text(),
        MenuItemKind::Icon(i) => i.text(),
    }.unwrap_or_default()
}
