//! Downloads of Discover books: the app's only network access. Started only by the user, only
//! from URLs bundled in the catalog, over HTTPS on every hop. Nothing is sent but the request.

use std::io::Read;
use std::time::Duration;

use crate::error::{AppError, AppResult};

/// Largest book we download. Checked against `Content-Length` and again while reading.
pub const MAX_BYTES: u64 = 200 * 1024 * 1024;

pub struct Download {
    pub reader: Box<dyn Read + Send>,
    /// From `Content-Length`, when the server sends it.
    pub length: Option<u64>,
}

/// Starts downloading `url`; the body is read by the caller, in chunks.
pub fn open(url: &str) -> AppResult<Download> {
    open_with(&agent(true), url, MAX_BYTES)
}

fn agent(https_only: bool) -> ureq::Agent {
    ureq::Agent::config_builder()
        .https_only(https_only)
        .max_redirects(5)
        .user_agent(concat!("Oikotheke/", env!("CARGO_PKG_VERSION")))
        .timeout_connect(Some(Duration::from_secs(20)))
        .timeout_recv_response(Some(Duration::from_secs(30)))
        // ureq has no per-read timeout; this bounds a stalled download.
        .timeout_recv_body(Some(Duration::from_secs(30 * 60)))
        .build()
        .into()
}

fn open_with(agent: &ureq::Agent, url: &str, max_bytes: u64) -> AppResult<Download> {
    let response = agent.get(url).call().map_err(network)?;
    let body = response.into_body();
    let length = body.content_length();
    if length.is_some_and(|len| len > max_bytes) {
        return Err(AppError::TooLarge(max_bytes));
    }
    Ok(Download {
        reader: Box::new(Capped {
            inner: body.into_reader(),
            read: 0,
            max: max_bytes,
        }),
        length,
    })
}

fn network(err: ureq::Error) -> AppError {
    log::warn!("download failed: {err}");
    let reason = match err {
        ureq::Error::StatusCode(code) => format!("the server answered HTTP {code}"),
        ureq::Error::Timeout(_) => "the connection timed out".into(),
        ureq::Error::RequireHttpsOnly(_) => "the address is not secure (HTTPS)".into(),
        ureq::Error::TooManyRedirects => "too many redirects".into(),
        ureq::Error::HostNotFound | ureq::Error::ConnectionFailed | ureq::Error::Io(_) => {
            "check your internet connection".into()
        }
        other => other.to_string(),
    };
    AppError::Network(reason)
}

/// Fails with `TooLarge` past `max` bytes, and reports read failures as network errors.
struct Capped<R> {
    inner: R,
    read: u64,
    max: u64,
}

impl<R: Read> Read for Capped<R> {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        let n = self.inner.read(buf).map_err(|err| {
            log::warn!("download interrupted: {err}");
            AppError::Network("the download was interrupted".into()).into_io()
        })?;
        self.read += n as u64;
        if self.read > self.max {
            return Err(AppError::TooLarge(self.max).into_io());
        }
        Ok(n)
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::Write;
    use std::net::TcpListener;

    use super::*;

    /// Serves each response once, in order, on a local port; returns the base URL. Each
    /// response is raw HTTP, so tests can send broken ones.
    pub fn serve(responses: Vec<Vec<u8>>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0u8; 4096];
                let _ = stream.read(&mut request);
                let _ = stream.write_all(&response);
            }
        });
        url
    }

    pub fn ok(body: &[u8]) -> Vec<u8> {
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        response.extend_from_slice(body);
        response
    }

    fn read_all(download: Download) -> AppResult<Vec<u8>> {
        let mut body = Vec::new();
        let mut reader = download.reader;
        reader.read_to_end(&mut body).map_err(AppError::from)?;
        Ok(body)
    }

    fn reason(result: AppResult<impl Sized>) -> String {
        match result {
            Err(AppError::Network(reason)) => reason,
            Err(other) => panic!("expected a network error, got {other:?}"),
            Ok(_) => panic!("expected a network error"),
        }
    }

    #[test]
    fn downloads_the_body() {
        let url = serve(vec![ok(b"%PDF-1.7 body")]);
        let download = open_with(&agent(false), &format!("{url}/book.pdf"), MAX_BYTES).unwrap();
        assert_eq!(download.length, Some(13));
        assert_eq!(read_all(download).unwrap(), b"%PDF-1.7 body");
    }

    #[test]
    fn follows_redirects() {
        let target = serve(vec![ok(b"moved")]);
        let redirect = format!(
            "HTTP/1.1 302 Found\r\nLocation: {target}/b\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        let url = serve(vec![redirect.into_bytes()]);
        let download = open_with(&agent(false), &format!("{url}/a"), MAX_BYTES).unwrap();
        assert_eq!(read_all(download).unwrap(), b"moved");
    }

    #[test]
    fn refuses_plain_http() {
        // Refused before connecting: nothing listens on this port.
        let reason = reason(open("http://127.0.0.1:9/book.pdf"));
        assert!(reason.contains("HTTPS"), "{reason}");
    }

    #[test]
    fn reports_http_errors() {
        let url = serve(vec![
            b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec(),
        ]);
        let reason = reason(open_with(&agent(false), &url, MAX_BYTES));
        assert_eq!(reason, "the server answered HTTP 404");
    }

    #[test]
    fn reports_offline_as_a_connection_problem() {
        let port = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port(); // Closed again: connecting is refused.
        let reason = reason(open_with(
            &agent(false),
            &format!("http://127.0.0.1:{port}/"),
            MAX_BYTES,
        ));
        assert_eq!(reason, "check your internet connection");
    }

    #[test]
    fn fails_on_a_truncated_body() {
        let url = serve(vec![
            b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\nshort".to_vec(),
        ]);
        let download = open_with(&agent(false), &url, MAX_BYTES).unwrap();
        assert_eq!(reason(read_all(download)), "the download was interrupted");
    }

    #[test]
    fn enforces_the_size_limit() {
        // Announced too large: refused before reading.
        let url = serve(vec![ok(&[0u8; 64])]);
        assert!(matches!(
            open_with(&agent(false), &url, 10),
            Err(AppError::TooLarge(10))
        ));
        // No length announced: stopped while reading.
        let mut unannounced = b"HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n".to_vec();
        unannounced.extend_from_slice(&[0u8; 64]);
        let url = serve(vec![unannounced]);
        let download = open_with(&agent(false), &url, 10).unwrap();
        assert_eq!(download.length, None);
        assert!(matches!(read_all(download), Err(AppError::TooLarge(10))));
    }
}
