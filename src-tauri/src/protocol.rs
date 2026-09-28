//! `oikotheke://` URI scheme serving managed files to the webview:
//! - `book/<id>`  — the PDF, with HTTP `Range` support so pdf.js reads only what it needs
//! - `cover/<id>` — the cover image
//!
//! Only files inside managed storage are reachable (ids are validated as UUIDs).

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::state::AppState;
use crate::storage::{BOOK_FILE, COVER_FILE};

pub const SCHEME: &str = "oikotheke";

/// Upper bound for a single range response, protects against huge requests.
const MAX_RANGE: u64 = 16 * 1024 * 1024;

type HttpResponse = Response<Vec<u8>>;

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    // File I/O off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        responder.respond(respond(&state, &request));
    });
}

fn respond(state: &AppState, request: &Request<Vec<u8>>) -> HttpResponse {
    if request.method() == "OPTIONS" {
        return with_cors(Response::builder().status(StatusCode::NO_CONTENT))
            .body(Vec::new())
            .unwrap();
    }
    let Some(path) = resolve(state, request.uri().path()) else {
        return status(StatusCode::NOT_FOUND);
    };
    let range = request
        .headers()
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    match serve_file(&path, range.as_deref()) {
        Ok(response) => response,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => status(StatusCode::NOT_FOUND),
        Err(err) => {
            log::error!("oikotheke protocol: {err}");
            status(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Maps `/book/<id>` or `/cover/<id>` (possibly percent-encoded as one segment) to a file.
fn resolve(state: &AppState, raw_path: &str) -> Option<PathBuf> {
    let path = percent_decode(raw_path.trim_start_matches('/'));
    let (kind, id) = path.split_once('/')?;
    let file = match kind {
        "book" => BOOK_FILE,
        "cover" => COVER_FILE,
        _ => return None,
    };
    Some(state.storage.book_dir(id).ok()?.join(file))
}

fn serve_file(path: &PathBuf, range: Option<&str>) -> std::io::Result<HttpResponse> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    let content_type = if path.ends_with(BOOK_FILE) {
        "application/pdf"
    } else {
        "image/jpeg"
    };
    let builder = with_cors(Response::builder())
        .header(header::CONTENT_TYPE, content_type)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-cache");

    let Some(range) = range else {
        log::debug!("oikotheke full read ({} KB) of {:?}", len / 1024, path);
        let mut body = Vec::with_capacity(len as usize);
        file.read_to_end(&mut body)?;
        return Ok(builder.status(StatusCode::OK).body(body).unwrap());
    };
    let Some((start, end)) = parse_range(range, len) else {
        return Ok(builder
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, format!("bytes */{len}"))
            .body(Vec::new())
            .unwrap());
    };
    log::debug!(
        "oikotheke range {start}-{end} ({} KB) of {:?}",
        (end - start + 1) / 1024,
        path.file_name()
    );
    file.seek(SeekFrom::Start(start))?;
    let mut body = vec![0u8; (end - start + 1) as usize];
    file.read_exact(&mut body)?;
    Ok(builder
        .status(StatusCode::PARTIAL_CONTENT)
        .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
        .body(body)
        .unwrap())
}

/// Parses a single `bytes=start-end` / `bytes=start-` / `bytes=-suffix` range into an
/// inclusive `(start, end)` clamped to the file, capped at `MAX_RANGE` bytes.
fn parse_range(value: &str, len: u64) -> Option<(u64, u64)> {
    let spec = value.trim().strip_prefix("bytes=")?;
    if spec.contains(',') || len == 0 {
        return None;
    }
    let (start, end) = spec.split_once('-')?;
    let (start, end) = match (start.trim(), end.trim()) {
        ("", suffix) => {
            let suffix: u64 = suffix.parse().ok()?;
            (len.saturating_sub(suffix), len - 1)
        }
        (start, "") => (start.parse().ok()?, len - 1),
        (start, end) => (start.parse().ok()?, end.parse::<u64>().ok()?.min(len - 1)),
    };
    if start > end || start >= len {
        return None;
    }
    Some((start, end.min(start + MAX_RANGE - 1)))
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn with_cors(builder: tauri::http::response::Builder) -> tauri::http::response::Builder {
    builder
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range")
        .header(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Content-Range, Content-Length",
        )
}

fn status(code: StatusCode) -> HttpResponse {
    with_cors(Response::builder())
        .status(code)
        .body(Vec::new())
        .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=900-", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=990-2000", 1000), Some((990, 999)));
        assert_eq!(parse_range("bytes=1000-", 1000), None);
        assert_eq!(parse_range("bytes=5-1", 1000), None);
        assert_eq!(parse_range("bytes=0-1,5-6", 1000), None);
        assert_eq!(parse_range("items=0-1", 1000), None);
    }

    #[test]
    fn caps_range_size() {
        let len = MAX_RANGE * 4;
        assert_eq!(parse_range("bytes=0-", len), Some((0, MAX_RANGE - 1)));
    }

    #[test]
    fn decodes_percent_encoding() {
        assert_eq!(percent_decode("book%2Fabc"), "book/abc");
        assert_eq!(percent_decode("cover/abc"), "cover/abc");
        assert_eq!(percent_decode("bad%zz"), "bad%zz");
    }

    #[test]
    fn serves_partial_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(BOOK_FILE);
        std::fs::write(&path, b"0123456789").unwrap();
        let response = serve_file(&path, Some("bytes=2-5")).unwrap();
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body(), b"2345");
        assert_eq!(response.headers()[header::CONTENT_RANGE], "bytes 2-5/10");
    }
}
