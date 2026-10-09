//! The Chief of Staff core: reads the workspace files and answers the pages' requests.
//!
//! It contains no network code. A caller hands it a request (method, path, headers, body) and gets a
//! response back. The app passes requests from its window; the test server passes them from a loopback
//! socket. Routes, request checks and the page files all live here, so both callers behave the same.
use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};

use serde::Serialize;
use serde_json::{json, Map, Value};

pub mod agents;
pub mod board;
pub mod briefing;
pub mod corrections;
pub mod js;
pub mod ledger;
pub mod library;
pub mod markdown;
pub mod meetings;
pub mod notes;
pub mod paths;
pub mod people;
pub mod people_page;
pub mod store;
pub mod today;

pub use paths::Workspace;

/// The app's name. It is written once, as productName in app/tauri.conf.json; the window title, the menus
/// and the pages' title and brand all come from there, so a rename is one edit.
pub static APP_NAME: LazyLock<String> = LazyLock::new(|| {
    let conf: Value = serde_json::from_str(include_str!("../../app/tauri.conf.json")).expect("app/tauri.conf.json is JSON");
    conf["productName"].as_str().expect("productName in app/tauri.conf.json").to_string()
});

/// Where the pages' HTML shows the app's name: the page title, the brand, and any element marked
/// class="app-name". The HTML keeps a literal name there; the core writes the app's name over it.
static NAME_SLOTS: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r#"(<title>|<span class="(?:brand-name|app-name)"[^>]*>)[^<]*(</title>|</span>)"#).unwrap()
});

/// A workspace that carries this file is the sample: the "Recreated demo data" badge shows, and ages on
/// the Meetings page count to the newest meeting instead of today.
pub const SAMPLE_MARKER: &str = ".sample-workspace";

const MAX_BODY: usize = 64 * 1024;

#[derive(Debug)]
pub enum Error {
    /// Sent as { error } with this status.
    Status(u16, String),
    /// A path outside the data root, or an invalid one: 400.
    Path(String),
    /// A file that isn't there: 404 "File not found".
    NotFound,
    /// A meeting name that is not one of the summaries listed from meeting-notes/: 404, sent as
    /// { error, noSummary } so the page can show a plain notice naming it (decision 76).
    NoSummary(String),
    /// A name in a person's address that is no one in people.md, or is "me": 404, sent as { error, noPerson } so the
    /// page can show a plain notice naming it.
    NoPerson(String, String),
    /// Anything unexpected: 500 "Server error".
    Internal(String),
}

/// Something in a file that could not be read; shown on the page and printed once.
#[derive(Debug, Clone, Serialize)]
pub struct Warning {
    pub file: String,
    pub message: String,
}

/// Who may call the core. Each caller lists the Host values and Origins its own pages use.
#[derive(Debug, Clone)]
pub struct Policy {
    /// `None` skips the Host check (no Host header exists without a socket).
    pub allowed_hosts: Option<Vec<String>>,
    pub allowed_origins: Vec<String>,
}

impl Policy {
    /// For a server on 127.0.0.1:`port`. The Host check blocks DNS rebinding; the Origin check blocks
    /// cross-site writes.
    pub fn loopback(port: u16) -> Self {
        let hosts = vec![format!("localhost:{port}"), format!("127.0.0.1:{port}")];
        let origins = hosts.iter().map(|h| format!("http://{h}")).collect();
        Policy { allowed_hosts: Some(hosts), allowed_origins: origins }
    }

    /// For the app's own URL scheme, e.g. "mc://localhost". Requests come from the app's window, not a
    /// socket, so there is no Host header to check.
    pub fn app_scheme(origin: &str) -> Self {
        Policy { allowed_hosts: None, allowed_origins: vec![origin.to_string()] }
    }

    /// The pages may load scripts, styles, images and data only from where they came from.
    fn content_security_policy(&self) -> String {
        let own = std::iter::once("'self'".to_string()).chain(self.allowed_origins.iter().cloned()).collect::<Vec<_>>().join(" ");
        format!("default-src {own}; img-src {own} data:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    }
}

pub struct Request<'a> {
    pub method: &'a str,
    /// Path and query as sent, e.g. "/api/meeting?file=x.md".
    pub target: &'a str,
    /// Header names in lowercase.
    pub headers: &'a [(String, String)],
    pub body: &'a [u8],
}

impl Request<'_> {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers.iter().find(|(n, _)| n == name).map(|(_, v)| v.as_str())
    }
}

pub struct Response {
    pub status: u16,
    pub content_type: &'static str,
    /// Headers besides Content-Type: no caching, no type sniffing, and the content security policy.
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

impl Response {
    fn new(status: u16, content_type: &'static str, body: Vec<u8>) -> Self {
        Response { status, content_type, headers: Vec::new(), body }
    }

    fn json(status: u16, value: &Value) -> Self {
        let body = serde_json::to_vec(&js::normalize_numbers(value.clone())).unwrap();
        Response::new(status, "application/json; charset=utf-8", body)
    }

    fn error(status: u16, message: &str) -> Self {
        Response::json(status, &json!({ "error": message }))
    }
}

// The pages, built into the core so every caller serves exactly the same files.
const PAGES: [(&str, &str, &[u8]); 5] = [
    ("index.html", "text/html; charset=utf-8", include_bytes!("../../public/index.html")),
    ("app.js", "text/javascript; charset=utf-8", include_bytes!("../../public/app.js")),
    ("styles.css", "text/css; charset=utf-8", include_bytes!("../../public/styles.css")),
    // The app's welcome window, shown before a workspace is open.
    ("welcome.html", "text/html; charset=utf-8", include_bytes!("../../public/welcome.html")),
    ("welcome.js", "text/javascript; charset=utf-8", include_bytes!("../../public/welcome.js")),
];

/// The answer when no workspace is open yet: the built-in pages only (the app's welcome window uses
/// them); every API request is refused.
pub fn pages_only(policy: &Policy, req: &Request) -> Response {
    let path = url::Url::parse("http://127.0.0.1/").unwrap().join(req.target).map(|u| u.path().to_string()).unwrap_or_default();
    let response = if req.method != "GET" {
        Response::error(405, "Method not allowed")
    } else if path.starts_with("/api/") {
        Response::error(503, "No workspace is open")
    } else {
        serve_page(&path).unwrap_or_else(|_| Response::error(400, "Bad URL encoding"))
    };
    with_headers(response, policy)
}

fn with_headers(mut response: Response, policy: &Policy) -> Response {
    response.headers.push(("Cache-Control", "no-store".into()));
    response.headers.push(("X-Content-Type-Options", "nosniff".into()));
    response.headers.push(("Content-Security-Policy", policy.content_security_policy()));
    response
}

pub struct Core {
    ws: Workspace,
    policy: Policy,
    // One request at a time, so a read-modify-write of a file is never interleaved with another.
    lock: Mutex<()>,
    seen_warnings: Mutex<HashSet<String>>,
    log: Box<dyn Fn(&str) + Send + Sync>,
    /// The Help page's Markdown (help.md), handed over by the caller; None if it couldn't be read.
    help: Option<String>,
}

static CARD_ROUTE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\/api\/board\/cards\/([\w-]+)$", ""));
static MOVE_ROUTE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\/api\/board\/cards\/([\w-]+)\/move$", ""));
static ACCEPT_ROUTE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\/api\/board\/cards\/([\w-]+)\/accept$", ""));
static TODAY_ROUTE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\/api\/today\/items\/([\w-]+)\/(close|reopen|keep|due)$", ""));
static PERSON_ROUTE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\/api\/people\/([^/]+)$", ""));
static PERSON_ACT_ROUTE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\/api\/people\/([^/]+)\/items\/([\w-]+)\/(close|reopen|due)$", ""));
static NOTE_ROUTE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\/api\/notes\/([\w-]+)$", ""));
static BOOK_ROUTE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^\/api\/library\/books\/(\d+)$", ""));
static JSON_TYPE: LazyLock<regex::Regex> = LazyLock::new(|| js::re(r"^application\/json\b", ""));

enum Route {
    Config, Today, TodayAct(String, String), Meetings, Meeting,
    Board, AddCard, EditCard(String), MoveCard(String), AcceptCard(String), DeleteCard(String),
    Library, Notes, AddBook, EditBook(String),
    Corrections, AddCorrection, Agents, People, Person(String), PersonAct(String, String, String),
    AddNote, EditNote(String), DeleteNote(String), Help,
}

/// The route for a method and path: Ok(route), Err(true) if the path exists for another method, Err(false) if none.
fn match_route(method: &str, path: &str) -> Result<Route, bool> {
    let card = CARD_ROUTE.captures(path).map(|c| c[1].to_string());
    let moved = MOVE_ROUTE.captures(path).map(|c| c[1].to_string());
    let accepted = ACCEPT_ROUTE.captures(path).map(|c| c[1].to_string());
    let book = BOOK_ROUTE.captures(path).map(|c| c[1].to_string());
    let note = NOTE_ROUTE.captures(path).map(|c| c[1].to_string());
    // A person's name comes percent-encoded in the path; one that doesn't decode matches no route.
    let person = PERSON_ROUTE.captures(path).and_then(|c| percent_decode(&c[1])).map(Route::Person);
    let person_act = PERSON_ACT_ROUTE.captures(path).and_then(|c| Some(Route::PersonAct(percent_decode(&c[1])?, c[2].to_string(), c[3].to_string())));
    let today_act = TODAY_ROUTE.captures(path).map(|c| Route::TodayAct(c[1].to_string(), c[2].to_string()));
    let candidates: Vec<(&str, Option<Route>)> = vec![
        ("GET", (path == "/api/config").then_some(Route::Config)),
        ("GET", (path == "/api/today").then_some(Route::Today)),
        ("POST", today_act),
        ("GET", (path == "/api/meetings").then_some(Route::Meetings)),
        ("GET", (path == "/api/meeting").then_some(Route::Meeting)),
        ("GET", (path == "/api/board").then_some(Route::Board)),
        ("POST", (path == "/api/board/cards").then_some(Route::AddCard)),
        ("PUT", card.clone().map(Route::EditCard)),
        ("POST", moved.map(Route::MoveCard)),
        ("POST", accepted.map(Route::AcceptCard)),
        ("DELETE", card.map(Route::DeleteCard)),
        ("GET", (path == "/api/library").then_some(Route::Library)),
        ("GET", (path == "/api/library/notes").then_some(Route::Notes)),
        ("POST", (path == "/api/library/books").then_some(Route::AddBook)),
        ("PUT", book.map(Route::EditBook)),
        ("GET", (path == "/api/corrections").then_some(Route::Corrections)),
        ("POST", (path == "/api/corrections").then_some(Route::AddCorrection)),
        ("GET", (path == "/api/agents").then_some(Route::Agents)),
        ("GET", (path == "/api/people").then_some(Route::People)),
        ("GET", person),
        ("POST", person_act),
        ("POST", (path == "/api/notes").then_some(Route::AddNote)),
        ("PUT", note.clone().map(Route::EditNote)),
        ("DELETE", note.map(Route::DeleteNote)),
        ("GET", (path == "/api/help").then_some(Route::Help)),
    ];
    let mut path_matched = false;
    for (m, route) in candidates {
        let Some(route) = route else { continue };
        path_matched = true;
        if m == method { return Ok(route); }
    }
    Err(path_matched)
}

impl Core {
    pub fn new(ws: Workspace, policy: Policy, log: impl Fn(&str) + Send + Sync + 'static) -> Self {
        Core { ws, policy, lock: Mutex::new(()), seen_warnings: Mutex::new(HashSet::new()), log: Box::new(log), help: None }
    }

    /// The Help page's text. help.md is not part of the workspace: the app ships it as a resource and the test server
    /// reads the repository's copy, so each caller reads it and hands it over here.
    pub fn with_help(mut self, markdown: Option<String>) -> Self {
        self.help = markdown;
        self
    }

    pub fn workspace(&self) -> &Workspace {
        &self.ws
    }

    /// The sample workspace carries the marker file.
    pub fn demo(&self) -> bool {
        self.ws.resolve(SAMPLE_MARKER).is_ok_and(|p| p.is_file())
    }

    fn log_warnings(&self, warnings: &Value) {
        let mut seen = self.seen_warnings.lock().unwrap();
        for w in warnings.as_array().into_iter().flatten() {
            let line = format!("{}: {}", w["file"].as_str().unwrap_or(""), w["message"].as_str().unwrap_or(""));
            if seen.insert(line.clone()) { (self.log)(&format!("[could not read] {line}")); }
        }
    }

    pub fn handle(&self, req: &Request) -> Response {
        let _one_at_a_time = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        // A bug in one request answers 500 instead of ending the app.
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| self.respond(req)))
            .unwrap_or_else(|_| Err(Error::Internal("the request panicked".into())));
        let response = match result {
            Ok(r) => r,
            Err(Error::Status(s, m)) => Response::error(s, &m),
            Err(Error::Path(m)) => Response::error(400, &m),
            Err(Error::NotFound) => Response::error(404, "File not found"),
            Err(Error::NoSummary(name)) => Response::json(404, &json!({
                "error": format!("There is no summary named \"{name}\" in meeting-notes/."), "noSummary": name,
            })),
            Err(Error::NoPerson(name, message)) => Response::json(404, &json!({ "error": message, "noPerson": name })),
            Err(Error::Internal(m)) => {
                (self.log)(&format!("Server error: {m}"));
                Response::error(500, "Server error")
            }
        };
        with_headers(response, &self.policy)
    }

    // Only this app's own pages may call the core: the Host must be one of ours (blocks DNS rebinding),
    // and writes must come from our origin as JSON (blocks cross-site form posts).
    fn check_request(&self, req: &Request) -> Result<(), Error> {
        if let Some(hosts) = &self.policy.allowed_hosts {
            if !req.header("host").is_some_and(|h| hosts.iter().any(|a| a == h)) {
                return Err(Error::Status(403, "Unexpected Host header".into()));
            }
        }
        if req.method == "GET" || req.method == "HEAD" { return Ok(()); }
        if let Some(origin) = req.header("origin") {
            if !self.policy.allowed_origins.iter().any(|o| o == origin) {
                return Err(Error::Status(403, "Writes are only accepted from this app".into()));
            }
        }
        if req.method != "DELETE" && !JSON_TYPE.is_match(req.header("content-type").unwrap_or("")) {
            return Err(Error::Status(415, "Send JSON".into()));
        }
        Ok(())
    }

    fn read_body(&self, req: &Request) -> Result<Map<String, Value>, Error> {
        if req.method == "GET" || req.method == "DELETE" || req.body.is_empty() { return Ok(Map::new()); }
        if req.body.len() > MAX_BODY { return Err(Error::Status(413, "Request too large".into())); }
        let value: Value = serde_json::from_str(&String::from_utf8_lossy(req.body)).map_err(|_| Error::Status(400, "Invalid JSON".into()))?;
        match value {
            Value::Object(m) => Ok(m),
            _ => Err(Error::Status(400, "Expected a JSON object".into())),
        }
    }

    fn respond(&self, req: &Request) -> Result<Response, Error> {
        self.check_request(req)?;
        // Parsed the way a browser would (WHATWG URL), so "." and ".." segments, also as %2e, are folded away.
        static BASE: LazyLock<url::Url> = LazyLock::new(|| url::Url::parse("http://127.0.0.1/").unwrap());
        let url = BASE.join(req.target).map_err(|_| Error::Status(400, "Bad URL".into()))?;
        let path = url.path().to_string();
        let param = |name: &str| url.query_pairs().find(|(k, _)| k == name).map(|(_, v)| v.into_owned());
        match match_route(req.method, &path) {
            Ok(route) => {
                let body = self.read_body(req)?;
                Ok(Response::json(200, &self.run(route, &body, &param)?))
            }
            Err(true) => Ok(Response::error(405, "Method not allowed")),
            Err(false) if path.starts_with("/api/") => Ok(Response::error(404, "Not found")),
            Err(false) if req.method != "GET" => Ok(Response::error(405, "Method not allowed")),
            Err(false) => serve_page(&path),
        }
    }

    fn run(&self, route: Route, body: &Map<String, Value>, param: &dyn Fn(&str) -> Option<String>) -> Result<Value, Error> {
        let ws = &self.ws;
        // "Show private notes": Manager-only notes in a summary, and the text of my notes between meetings.
        let private = param("private").as_deref() == Some("1");
        Ok(match route {
            Route::Config => json!({ "demo": self.demo(), "dataRoot": ws.root().file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default() }),
            // ?week=this|last picks the briefing's week.
            Route::Today => today::today_view(ws, self.demo(), briefing::Week::parse(param("week").as_deref())?)?,
            Route::TodayAct(id, action) => today::act(ws, self.demo(), &id, &action, body, briefing::Week::parse(param("week").as_deref())?)?,
            Route::Meetings => {
                let overview = meetings::meetings_overview(ws, self.demo())?;
                self.log_warnings(&overview["warnings"]);
                overview
            }
            Route::Meeting => self.meeting(&param("file").unwrap_or_default(), private)?,
            Route::Board => board::board_view(ws, self.demo())?,
            Route::AddCard => board::add_card(ws, self.demo(), body)?,
            Route::EditCard(id) => board::edit_card(ws, self.demo(), &id, body)?,
            Route::MoveCard(id) => board::move_card(ws, self.demo(), &id, body)?,
            Route::AcceptCard(id) => board::accept_card(ws, self.demo(), &id)?,
            Route::DeleteCard(id) => board::delete_card(ws, self.demo(), &id)?,
            Route::Library => {
                let view = library::library_view(ws)?;
                self.log_warnings(&view["warnings"]);
                view
            }
            Route::Notes => library::notes_page(ws, &param("file").unwrap_or_default())?,
            Route::AddBook => library::add_book(ws, body)?,
            // An index too large to hold is no book at all, which edit_book reports as a changed file.
            Route::EditBook(index) => library::edit_book(ws, index.parse().unwrap_or(usize::MAX), body)?,
            Route::Corrections => {
                let view = corrections::corrections_view(ws)?;
                self.log_warnings(&view["warnings"]);
                view
            }
            Route::AddCorrection => corrections::add_correction(ws, body)?,
            Route::Agents => {
                let view = agents::load_agents(ws)?;
                self.log_warnings(&view["warnings"]);
                view
            }
            Route::People => {
                let view = people_page::list_view(ws, self.demo(), private)?;
                self.log_warnings(&view["warnings"]);
                view
            }
            Route::Person(name) => people_page::person_view(ws, self.demo(), &name, private)?,
            Route::PersonAct(name, id, action) => people_page::act(ws, self.demo(), &name, &id, &action, body, private)?,
            Route::AddNote => notes::add(ws, self.demo(), body, private)?,
            Route::EditNote(id) => notes::edit(ws, self.demo(), &id, body, private)?,
            Route::DeleteNote(id) => notes::delete(ws, &id)?,
            // Drawn like a meeting summary. help.md has no "Manager-only note" item, so nothing is held back.
            Route::Help => match &self.help {
                Some(text) => json!({ "html": markdown::render_markdown(text, false).html }),
                None => return Err(Error::Status(404, "The Help page is missing from the app.".into())),
            },
        })
    }

    fn meeting(&self, file: &str, show_private: bool) -> Result<Value, Error> {
        use meetings::{extract_header_fields, parse_meeting, COULD_NOT_READ, FIELDS_PLACEHOLDER};
        use markdown::{render_inline, render_markdown};
        // Only a summary listed from meeting-notes/ opens, the rule the Board uses for a card's meeting (decision 76).
        // The name is compared with the listed names, never resolved as a path, so "..", "/" and absolute paths
        // can't match, and nothing is read for a name that isn't listed.
        if !meetings::summary_files(&self.ws)?.iter().any(|f| f == file) { return Err(Error::NoSummary(file.to_string())); }
        let meta = parse_meeting(&self.ws, file)?;
        let header = extract_header_fields(&self.ws.read_text(&format!("meeting-notes/{file}"))?);
        if !header.missing.is_empty() {
            let missing: Vec<Value> = header.missing.iter().map(|n| json!({ "file": file, "message": format!("header field \"{n}\" {COULD_NOT_READ}") })).collect();
            self.log_warnings(&Value::Array(missing));
        }
        let rendered = render_markdown(&header.body, show_private);
        // Header fields one per line, placed where they were in the file.
        let fields_html = format!("<dl class=\"meeting-fields\">{}</dl>", header.fields.iter().map(|f| format!(
            "<dt>{}</dt><dd>{}</dd>",
            render_inline(&f.name),
            match &f.value { None => format!("<span class=\"cnr\">{COULD_NOT_READ}</span>"), Some(v) => render_inline(v) },
        )).collect::<String>());
        let slot = format!("<p>{FIELDS_PLACEHOLDER}</p>");
        let html = &rendered.html;
        let body = match html.find(&slot) {
            Some(at) => format!("{}{fields_html}{}", &html[..at], &html[at + slot.len()..]),
            None => fields_html + &html.replace(FIELDS_PLACEHOLDER, ""),
        };
        Ok(json!({
            "file": file, "date": meta.date, "title": meta.title, "people": meta.people, "type": meta.kind,
            "html": body, "privateNotes": rendered.private_notes,
            // "Since this meeting": my notes that name it, and the box to add one. The summary itself is never edited.
            "notes": notes::meeting_block(&self.ws, self.demo(), file, show_private)?,
        }))
    }
}

fn serve_page(path: &str) -> Result<Response, Error> {
    let not_found = || Ok(Response::new(404, "text/plain; charset=utf-8", b"Not found".to_vec()));
    let rel = if path == "/" {
        "index.html".to_string()
    } else {
        match percent_decode(&path[1..]) {
            Some(r) => r,
            None => return Err(Error::Status(400, "Bad URL encoding".into())),
        }
    };
    // Fold "." and ".." the way path.resolve did; anything that leaves the page folder is not found.
    let mut parts: Vec<&str> = Vec::new();
    for seg in rel.split('/') {
        match seg {
            "" | "." => {}
            ".." => { if parts.pop().is_none() { return not_found(); } }
            s => parts.push(s),
        }
    }
    let name = parts.join("/");
    match PAGES.iter().find(|(n, _, _)| *n == name) {
        Some((name, content_type, body)) if name.ends_with(".html") => {
            let name = markdown::escape_html(&APP_NAME);
            let html = NAME_SLOTS.replace_all(&String::from_utf8_lossy(body), |c: &regex::Captures| format!("{}{name}{}", &c[1], &c[2])).into_owned();
            Ok(Response::new(200, content_type, html.into_bytes()))
        }
        Some((_, content_type, body)) => Ok(Response::new(200, content_type, body.to_vec())),
        None => not_found(),
    }
}

/// decodeURIComponent: None where it would throw (a bad % sequence or invalid UTF-8).
fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn help_md_renders_whole() {
        // A list item that starts "Manager-only note" would be held back like a private note in a summary.
        let rendered = markdown::render_markdown(include_str!("../../help.md"), false);
        assert_eq!(rendered.private_notes, 0);
        // No links out: the app has no browser for them.
        assert!(!rendered.html.contains("href=\"http"), "{}", rendered.html);
    }
}
