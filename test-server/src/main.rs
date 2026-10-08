// Loopback HTTP wrapper around the core, used only by the test suite (test/helpers/site.js). It is never
// part of the app. It moves requests between a socket on 127.0.0.1 and Core::handle and decides nothing.
//
// MC_ROOT  the data folder (required)
// PORT     the port on 127.0.0.1 (default 3000)
use std::io::Read;
use std::path::PathBuf;

use chief_of_staff_core::{Core, Policy, Request, Response, Workspace};

fn main() {
    let root = match std::env::var("MC_ROOT") {
        Ok(r) if !r.is_empty() => r,
        _ => { eprintln!("Set MC_ROOT to the data folder."); std::process::exit(2); }
    };
    let root = std::env::current_dir().map(|d| d.join(&root)).unwrap_or_else(|_| PathBuf::from(&root));
    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(3000);
    if !root.exists() { eprintln!("Data root not found: {}", root.display()); }

    let core = Core::new(Workspace::new(&root), Policy::loopback(port), |line| eprintln!("{line}"));
    let server = tiny_http::Server::http(("127.0.0.1", port)).unwrap_or_else(|e| {
        eprintln!("Could not listen on 127.0.0.1:{port}: {e}");
        std::process::exit(1);
    });
    let demo = if core.demo() { ", sample workspace" } else { "" };
    println!("{} test server: http://localhost:{port}  (data: {}{demo})", *chief_of_staff_core::APP_NAME, root.display());

    for mut req in server.incoming_requests() {
        let method = req.method().as_str().to_string();
        let target = req.url().to_string();
        let headers: Vec<(String, String)> = req.headers().iter()
            .map(|h| (h.field.as_str().as_str().to_ascii_lowercase(), h.value.as_str().to_string()))
            .collect();
        // One byte over the limit is enough for the core to refuse the request as too large.
        let mut body = Vec::new();
        let _ = req.as_reader().take(64 * 1024 + 1).read_to_end(&mut body);

        let res = core.handle(&Request { method: &method, target: &target, headers: &headers, body: &body });
        let _ = req.respond(to_http(res));
    }
}

fn to_http(res: Response) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let mut out = tiny_http::Response::from_data(res.body).with_status_code(res.status);
    out.add_header(tiny_http::Header::from_bytes("Content-Type", res.content_type).unwrap());
    for (name, value) in &res.headers {
        out.add_header(tiny_http::Header::from_bytes(*name, value.as_bytes()).unwrap());
    }
    out
}
