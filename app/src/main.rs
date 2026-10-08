// The Mac app: one window that shows the pages, answered by the core through the app's own URL scheme,
// mc://localhost. It opens no network port. Every request the pages make goes to Core::handle; this file
// only carries requests and responses. The app's name and bundle id live in tauri.conf.json only.
mod settings;
mod workspace;
#[cfg(feature = "probe")]
mod probe;

use std::sync::{Arc, RwLock};

use chief_of_staff_core::{Core, Policy, Request};
use tauri::http;
use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, Wry};

pub const SCHEME: &str = "mc";
pub const ORIGIN: &str = "mc://localhost";
pub const WINDOW: &str = "main";

/// The core for the open workspace; none until a folder is chosen.
#[derive(Default)]
pub struct State {
    pub core: RwLock<Option<Arc<Core>>>,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(State::default())
        .register_asynchronous_uri_scheme_protocol(SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            std::thread::spawn(move || responder.respond(answer(&app, request)));
        })
        .menu(menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "choose-workspace" => workspace::choose_from_menu(app.clone()),
            "open-sample" => workspace::open_sample_from_menu(app.clone()),
            "reload" => {
                if let Some(window) = app.get_webview_window(WINDOW) { let _ = window.reload(); }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("the app could not start")
        // The workspace is chosen once the app has finished starting.
        .run(|app, event| {
            if let tauri::RunEvent::Ready = event { workspace::start(app.clone()); }
        });
}

/// Turns the window's request into a core Request, asks the core, and turns its Response back.
fn answer(app: &AppHandle, req: http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let target = req.uri().path_and_query().map_or("/", |p| p.as_str()).to_string();
    let headers: Vec<(String, String)> = req.headers().iter()
        .map(|(name, value)| (name.as_str().to_ascii_lowercase(), String::from_utf8_lossy(value.as_bytes()).into_owned()))
        .collect();
    let request = Request { method: req.method().as_str(), target: &target, headers: &headers, body: req.body() };
    let core = app.state::<State>().core.read().unwrap().clone();
    let res = match core {
        Some(core) => core.handle(&request),
        // Before a workspace is open (the welcome window), the core serves its pages and nothing else.
        None => chief_of_staff_core::pages_only(&Policy::app_scheme(ORIGIN), &request),
    };
    #[cfg(feature = "probe")]
    probe::log_request(app, req.method().as_str(), &target, &headers, res.status);
    let mut out = http::Response::builder().status(res.status).header("Content-Type", res.content_type);
    for (name, value) in &res.headers { out = out.header(*name, value); }
    out.body(res.body).unwrap()
}

fn menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let name = app.package_info().name.clone();
    let app_menu = SubmenuBuilder::new(app, &name)
        .about(None).separator().hide().hide_others().show_all().separator().quit()
        .build()?;
    let file = SubmenuBuilder::new(app, "File")
        .item(&MenuItemBuilder::with_id("choose-workspace", "Choose Workspace…").accelerator("CmdOrCtrl+O").build(app)?)
        .item(&MenuItemBuilder::with_id("open-sample", "Open Sample Workspace…").build(app)?)
        .separator().close_window()
        .build()?;
    // Cut, copy and paste in the forms need these items on macOS.
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo().redo().separator().cut().copy().paste().select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "View")
        .item(&MenuItemBuilder::with_id("reload", "Reload").accelerator("CmdOrCtrl+R").build(app)?)
        .separator().fullscreen()
        .build()?;
    let window = SubmenuBuilder::new(app, "Window").minimize().maximize().separator().bring_all_to_front().build()?;
    MenuBuilder::new(app).items(&[&app_menu, &file, &edit, &view, &window]).build()
}
