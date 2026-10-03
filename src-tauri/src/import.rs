//! Background import queue. Books are copied (or downloaded, for Discover) one at a time on a
//! worker thread so the UI never waits on disk or network I/O; progress is reported through
//! events.

use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::catalog::{self, CatalogEntry};
use crate::download;
use crate::error::{AppError, AppResult};
use crate::models::{new_id, Book};
use crate::services::library::{self, Origin};
use crate::state::AppState;

pub const EVENT_PROGRESS: &str = "import:progress";
pub const EVENT_COPIED: &str = "import:copied";
pub const EVENT_FAILED: &str = "import:failed";

const PROGRESS_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportJob {
    pub job_id: String,
    pub file_name: String,
    /// 0 when unknown (a download whose size is not known yet).
    pub total_bytes: u64,
    /// The Discover catalog entry being downloaded, if any.
    pub catalog_id: Option<String>,
    #[serde(skip)]
    pub source: ImportSource,
}

#[derive(Debug, Clone)]
pub enum ImportSource {
    /// A file picked or dropped by the user.
    Path(PathBuf),
    /// A Discover book, downloaded from its catalog URL.
    Catalog(String),
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressEvent<'a> {
    job_id: &'a str,
    copied_bytes: u64,
    total_bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CopiedEvent<'a> {
    job_id: &'a str,
    book: Book,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FailedEvent<'a> {
    job_id: &'a str,
    error: &'a AppError,
}

pub struct ImportQueue {
    sender: Mutex<Sender<ImportJob>>,
}

impl ImportQueue {
    /// Starts the worker thread. It looks up `AppState` lazily, so the state can be
    /// managed after the queue is created.
    pub fn start<R: Runtime>(app: AppHandle<R>) -> Self {
        let (sender, receiver) = mpsc::channel::<ImportJob>();
        std::thread::Builder::new()
            .name("import-worker".into())
            .spawn(move || {
                for job in receiver {
                    run_job(&app, &job);
                }
            })
            .expect("failed to spawn import worker");
        Self {
            sender: Mutex::new(sender),
        }
    }

    pub fn enqueue(&self, sources: Vec<PathBuf>) -> Vec<ImportJob> {
        sources
            .into_iter()
            .map(|source| {
                self.push(ImportJob {
                    job_id: new_id(),
                    file_name: source
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    total_bytes: std::fs::metadata(&source).map(|m| m.len()).unwrap_or(0),
                    catalog_id: None,
                    source: ImportSource::Path(source),
                })
            })
            .collect()
    }

    pub fn enqueue_catalog(&self, entry: &CatalogEntry) -> ImportJob {
        self.push(ImportJob {
            job_id: new_id(),
            file_name: entry.title.clone(),
            total_bytes: 0,
            catalog_id: Some(entry.id.clone()),
            source: ImportSource::Catalog(entry.id.clone()),
        })
    }

    fn push(&self, job: ImportJob) -> ImportJob {
        let sender = self.sender.lock().unwrap_or_else(|e| e.into_inner());
        // The worker lives for the whole app lifetime, so sending cannot fail.
        let _ = sender.send(job.clone());
        job
    }
}

fn run_job<R: Runtime>(app: &AppHandle<R>, job: &ImportJob) {
    let state = app.state::<AppState>();
    let mut last_emit = Instant::now();
    let mut emit_progress = |copied_bytes: u64, total_bytes: u64| {
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            let _ = app.emit(
                EVENT_PROGRESS,
                ProgressEvent {
                    job_id: &job.job_id,
                    copied_bytes,
                    total_bytes,
                },
            );
        }
    };
    let result = match &job.source {
        ImportSource::Path(path) => {
            library::copy_into_library(&state.db, &state.storage, path, |copied| {
                emit_progress(copied, job.total_bytes)
            })
        }
        ImportSource::Catalog(id) => download_book(&state, id, emit_progress),
    };
    let _ = match result {
        Ok(book) => app.emit(
            EVENT_COPIED,
            CopiedEvent {
                job_id: &job.job_id,
                book,
            },
        ),
        Err(error) => {
            log::warn!("import of {:?} failed: {error}", job.source);
            app.emit(
                EVENT_FAILED,
                FailedEvent {
                    job_id: &job.job_id,
                    error: &error,
                },
            )
        }
    };
}

fn download_book(
    state: &AppState,
    catalog_id: &str,
    mut on_progress: impl FnMut(u64, u64),
) -> AppResult<Book> {
    let entry = catalog::get(catalog_id)?;
    // Checked here too: the same book may have been queued twice.
    library::ensure_not_downloaded(&state.db, &entry.id)?;
    log::info!("downloading catalog book {}", entry.id);
    let download = download::open(&entry.url)?;
    let total = download.length.unwrap_or(0);
    let origin = Origin {
        title: &entry.title,
        catalog_id: Some(&entry.id),
    };
    library::import_stream(
        &state.db,
        &state.storage,
        download.reader,
        &origin,
        |copied| on_progress(copied, total),
    )
}
