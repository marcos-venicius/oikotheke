use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BookStatus {
    /// File copied, metadata/cover not generated yet.
    Importing,
    Ready,
    /// The managed PDF is gone from storage.
    Missing,
}

impl BookStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            BookStatus::Importing => "importing",
            BookStatus::Ready => "ready",
            BookStatus::Missing => "missing",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "ready" => BookStatus::Ready,
            "missing" => BookStatus::Missing,
            _ => BookStatus::Importing,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BookFormat {
    Pdf,
    Epub,
}

impl BookFormat {
    pub fn as_str(self) -> &'static str {
        match self {
            BookFormat::Pdf => "pdf",
            BookFormat::Epub => "epub",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "epub" => BookFormat::Epub,
            _ => BookFormat::Pdf,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub format: BookFormat,
    pub title: String,
    pub author: Option<String>,
    /// Relative to the app data directory.
    pub file_path: String,
    /// Relative to the app data directory.
    pub cover_path: Option<String>,
    /// PDF only; 0 when unknown (importing, or a reflowable EPUB).
    pub page_count: i64,
    /// Last reading position, interpreted per format (see `services::location`). None = start.
    pub location: Option<String>,
    /// Reading progress in [0, 1].
    pub progress: f64,
    pub zoom_level: Option<f64>,
    pub zoom_mode: Option<String>,
    pub file_size: i64,
    pub status: BookStatus,
    pub removed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub note_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub book_id: String,
    /// Where the note belongs, interpreted per format (see `services::location`).
    pub location: String,
    /// Display text captured when the note was created (e.g. a chapter title); None for PDF,
    /// whose label is derived from the page.
    pub label: Option<String>,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Metadata extracted by the UI to complete an import (pdf.js for PDF, `read_epub_metadata`
/// for EPUB).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookMetadata {
    pub title: String,
    pub author: Option<String>,
    /// PDF: at least 1. EPUB: 0 (reflowable books have no fixed pages).
    pub page_count: i64,
}

/// What the UI needs from an EPUB to complete its import.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpubMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub has_cover: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub location: String,
    pub progress: f64,
    pub zoom_level: Option<f64>,
    pub zoom_mode: Option<String>,
}
