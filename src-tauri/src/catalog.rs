//! The Discover catalog: freely licensed books the user can download and import. It is bundled
//! with the app (`catalog.json`), so listing it needs no network; only an import downloads.

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::BookFormat;

const CATALOG_JSON: &str = include_str!("../catalog.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    Classic,
    Technical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogEntry {
    pub id: String,
    pub title: String,
    pub author: String,
    pub year: i32,
    /// ISO 639-1 code of the book's language.
    pub language: String,
    pub category: Category,
    pub format: BookFormat,
    /// Official download URL. Never sent to the UI: downloads are requested by id only.
    #[serde(skip_serializing)]
    pub url: String,
    pub source: String,
    pub license: String,
    pub description: String,
}

pub fn entries() -> &'static [CatalogEntry] {
    static CATALOG: OnceLock<Vec<CatalogEntry>> = OnceLock::new();
    CATALOG.get_or_init(|| serde_json::from_str(CATALOG_JSON).expect("catalog.json is valid"))
}

pub fn get(id: &str) -> AppResult<&'static CatalogEntry> {
    entries()
        .iter()
        .find(|entry| entry.id == id)
        .ok_or_else(|| AppError::NotFound(format!("catalog entry {id}")))
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn catalog_is_valid() {
        let entries = entries();
        assert_eq!(entries.len(), 30);
        let ids: HashSet<_> = entries.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(ids.len(), entries.len(), "ids are unique");
        for entry in entries {
            assert!(entry.url.starts_with("https://"), "{}", entry.id);
            assert!(
                entry
                    .id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
                "{}",
                entry.id
            );
            assert!(
                ["pt", "en"].contains(&entry.language.as_str()),
                "{}",
                entry.id
            );
            for text in [&entry.title, &entry.author, &entry.source, &entry.license] {
                assert!(!text.trim().is_empty(), "{}", entry.id);
            }
        }
        let count = |category, language: &str| {
            entries
                .iter()
                .filter(|e| e.category == category && e.language == language)
                .count()
        };
        assert_eq!(count(Category::Classic, "pt"), 10);
        assert_eq!(count(Category::Classic, "en"), 10);
        assert_eq!(count(Category::Technical, "en"), 10);
    }

    #[test]
    fn url_never_reaches_the_ui() {
        let json = serde_json::to_value(get("dom-casmurro").unwrap()).unwrap();
        assert!(json.get("url").is_none());
        assert_eq!(json["format"], "epub");
        assert_eq!(json["category"], "classic");
        assert!(matches!(get("nope"), Err(AppError::NotFound(_))));
    }
}
