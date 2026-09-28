//! Background import queue. Files are copied one at a time on a worker thread so the
//! UI never waits on disk I/O; progress is reported through events.

use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::error::AppError;
use crate::models::{new_id, Book};
use crate::services::library;
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
    pub total_bytes: u64,
    #[serde(skip)]
    pub source: PathBuf,
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
        let sender = self.sender.lock().unwrap_or_else(|e| e.into_inner());
        sources
            .into_iter()
            .map(|source| {
                let job = ImportJob {
                    job_id: new_id(),
                    file_name: source
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    total_bytes: std::fs::metadata(&source).map(|m| m.len()).unwrap_or(0),
                    source,
                };
                // The worker lives for the whole app lifetime, so sending cannot fail.
                let _ = sender.send(job.clone());
                job
            })
            .collect()
    }
}

fn run_job<R: Runtime>(app: &AppHandle<R>, job: &ImportJob) {
    let state = app.state::<AppState>();
    let mut last_emit = Instant::now();
    let result = library::copy_into_library(&state.db, &state.storage, &job.source, |copied| {
        if last_emit.elapsed() >= PROGRESS_INTERVAL {
            last_emit = Instant::now();
            let _ = app.emit(
                EVENT_PROGRESS,
                ProgressEvent {
                    job_id: &job.job_id,
                    copied_bytes: copied,
                    total_bytes: job.total_bytes,
                },
            );
        }
    });
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
