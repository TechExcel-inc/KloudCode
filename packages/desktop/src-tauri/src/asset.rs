use std::thread;

use tauri::{ipc::CapabilityBuilder, AppHandle, Manager};
use tiny_http::{Header, Response, Server};

pub struct Port(pub u16);

/// Packaged macOS/Linux load `tauri://localhost`, which WKWebView will not
/// paint as a `frame-ancestors *` ancestor. Serve the UI over loopback HTTP
/// so the origin matches `tauri dev` (`http://127.0.0.1`).
pub fn boot(app: &AppHandle) -> Option<Port> {
    if cfg!(dev) {
        return None;
    }
    if !(cfg!(target_os = "macos") || cfg!(target_os = "linux")) {
        return None;
    }

    let server = Server::http("127.0.0.1:0").ok()?;
    let port = server.server_addr().to_ip()?.port();
    grant(app, port);
    let app = app.clone();
    thread::spawn(move || listen(server, app));
    tracing::info!(port, "frontend http://127.0.0.1");
    Some(Port(port))
}

fn grant(app: &AppHandle, port: u16) {
    let cap = CapabilityBuilder::new("asset-http")
        .remote(format!("http://127.0.0.1:{port}"))
        .remote(format!("http://localhost:{port}"))
        .window("main")
        .window("loading")
        .permission("core:default")
        .permission("opener:default")
        .permission("deep-link:default")
        .permission("core:window:allow-start-dragging")
        .permission("core:window:allow-set-theme")
        .permission("core:webview:allow-set-webview-zoom")
        .permission("core:window:allow-is-focused")
        .permission("core:window:allow-show")
        .permission("core:window:allow-unminimize")
        .permission("core:window:allow-set-focus")
        .permission("core:window:allow-close")
        .permission("core:window:allow-center")
        .permission("core:window:allow-minimize")
        .permission("core:window:allow-maximize")
        .permission("core:window:allow-set-size")
        .permission("core:window:allow-is-maximized")
        .permission("core:window:allow-toggle-maximize")
        .permission("decorum:allow-show-snap-overlay")
        .permission("shell:default")
        .permission("updater:default")
        .permission("dialog:default")
        .permission("process:default")
        .permission("store:default")
        .permission("window-state:default")
        .permission("os:default")
        .permission("notification:default")
        .permission("http:default")
        .permission("clipboard-manager:allow-read-image");
    if let Err(err) = app.add_capability(cap) {
        tracing::error!(%err, "asset-http capability");
    }
}

fn listen(server: Server, app: AppHandle) {
    let resolver = app.asset_resolver();
    for req in server.incoming_requests() {
        let path = req.url().split(['?', '#']).next().unwrap_or("/");
        let asset = resolver
            .get(path.to_string())
            .or_else(|| resolver.get("/index.html".into()));
        let Some(asset) = asset else {
            let _ = req.respond(Response::from_string("not found").with_status_code(404));
            continue;
        };

        let mut resp = Response::from_data(asset.bytes);
        if let Ok(h) = Header::from_bytes("Content-Type", asset.mime_type) {
            resp.add_header(h);
        }
        if let Some(csp) = asset.csp_header
            && let Ok(h) = Header::from_bytes("Content-Security-Policy", csp)
        {
            resp.add_header(h);
        }
        if let Ok(h) = Header::from_bytes("Cache-Control", "no-cache") {
            resp.add_header(h);
        }
        let _ = req.respond(resp);
    }
}
