use tiny_http::{Header, Method, Response, Server, StatusCode};

const RADIO_PROXY_PORT: u16 = 8787;

fn cors_header() -> Header {
    Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap()
}

// Only the Desk Rave app itself may use this proxy. A browser cross-origin request
// always carries an Origin header, so a malicious web page (which sends its own
// public origin) is rejected; the app's webview — tauri://localhost or
// http(s)://tauri.localhost — is allowed. A missing Origin is not a browser
// cross-site request, so it passes (a local native caller could reach the upstream
// directly anyway). This stops the loopback proxy being an open SSRF/CORS relay.
fn origin_ok(origin: Option<&str>) -> bool {
    match origin {
        None => true,
        Some(o) => {
            o.starts_with("tauri://")
                || o.contains("tauri.localhost")
                || o.starts_with("http://localhost")
                || o.starts_with("https://localhost")
                || o.starts_with("http://127.0.0.1")
                || o.starts_with("https://127.0.0.1")
        }
    }
}

// Re-serve an upstream radio stream same-origin with open CORS so the webview's
// AnalyserNode can read it (WebView2/WKWebView enforce CORS on cross-origin audio
// analysis, and most icecast streams send no CORS headers). Streams live, so the
// upstream reader is piped straight through — never buffered.
fn handle(request: tiny_http::Request) {
    // reject anything that isn't the Desk Rave webview (blocks web-page abuse)
    let origin = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Origin"))
        .map(|h| h.value.as_str().to_string());
    if !origin_ok(origin.as_deref()) {
        let mut r = Response::from_string("forbidden").with_status_code(403);
        r.add_header(cors_header());
        let _ = request.respond(r);
        return;
    }
    // preflight
    if request.method() == &Method::Options {
        let mut r = Response::from_string("").with_status_code(204);
        r.add_header(cors_header());
        let _ = request.respond(r);
        return;
    }
    // pull ?url=<encoded stream> out of the request path
    let target = request
        .url()
        .split_once("url=")
        .map(|(_, q)| urlencoding::decode(q).map(|s| s.into_owned()).unwrap_or_default())
        .filter(|u| u.starts_with("http"));
    let target = match target {
        Some(t) => t,
        None => {
            let _ = request.respond(Response::from_string("bad url").with_status_code(400));
            return;
        }
    };
    match ureq::get(&target)
        .set("Icy-MetaData", "0")
        .set("User-Agent", "DeskRave/0.1")
        .call()
    {
        Ok(resp) => {
            let ct = resp.header("Content-Type").unwrap_or("audio/mpeg").to_string();
            let headers = vec![
                cors_header(),
                Header::from_bytes(&b"Content-Type"[..], ct.as_bytes()).unwrap(),
            ];
            // data_length None → chunked/stream until the client disconnects
            let r = Response::new(StatusCode(200), headers, resp.into_reader(), None, None);
            let _ = request.respond(r);
        }
        Err(e) => {
            log::warn!("radio proxy: upstream fetch failed for {target}: {e}");
            let mut r = Response::from_string("upstream error").with_status_code(502);
            r.add_header(cors_header());
            let _ = request.respond(r);
        }
    }
}

fn start_radio_proxy() {
    std::thread::spawn(|| match Server::http(("127.0.0.1", RADIO_PROXY_PORT)) {
        Ok(server) => {
            for request in server.incoming_requests() {
                // one thread per request so a long-lived stream doesn't block others
                std::thread::spawn(move || handle(request));
            }
        }
        Err(e) => log::warn!("radio proxy failed to bind 127.0.0.1:{RADIO_PROXY_PORT}: {e}"),
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // launch-on-boot toggle (registers/removes a login item)
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            start_radio_proxy();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
