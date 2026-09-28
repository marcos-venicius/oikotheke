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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub title: String,
    pub author: Option<String>,
    /// Relative to the app data directory.
    pub file_path: String,
    /// Relative to the app data directory.
    pub cover_path: Option<String>,
    pub page_count: i64,
    pub current_page: i64,
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
    pub page_number: i64,
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Metadata extracted by the UI (pdf.js) to complete an import.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookMetadata {
    pub title: String,
    pub author: Option<String>,
    pub page_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub current_page: i64,
    pub zoom_level: Option<f64>,
    pub zoom_mode: Option<String>,
}
