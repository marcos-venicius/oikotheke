//! Reading progress autosave. Validation lives here; persistence in `db::books`.

use crate::db::{books, Database};
use crate::error::AppResult;
use crate::models::ReadingProgress;
use crate::services::location;

pub fn save(db: &Database, book_id: &str, progress: &ReadingProgress) -> AppResult<()> {
    let conn = db.conn();
    let book = books::get(&conn, book_id)?;
    let progress = ReadingProgress {
        location: location::validate(&book, &progress.location)?,
        progress: location::validate_progress(progress.progress)?,
        ..progress.clone()
    };
    books::update_progress(&conn, book_id, &progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;
    use crate::models::BookMetadata;
    use crate::services::library::{self, tests::*};

    fn progress(location: &str, fraction: f64) -> ReadingProgress {
        ReadingProgress {
            location: location.into(),
            progress: fraction,
            zoom_level: Some(1.5),
            zoom_mode: Some("custom".into()),
        }
    }

    #[test]
    fn saves_valid_progress_and_rejects_invalid() {
        let (dir, db, storage) = setup();
        let book =
            library::copy_into_library(&db, &storage, &write_pdf(dir.path(), "a.pdf"), |_| {})
                .unwrap();
        let meta = BookMetadata {
            title: "a".into(),
            author: None,
            page_count: 10,
        };
        library::finalize_import(&db, &storage, &book.id, &meta).unwrap();

        save(&db, &book.id, &progress("4", 0.4)).unwrap();
        let saved = books::get(&db.conn(), &book.id).unwrap();
        assert_eq!(saved.location.as_deref(), Some("4"));
        assert_eq!(saved.progress, 0.4);
        assert_eq!(saved.zoom_level, Some(1.5));
        assert_eq!(saved.zoom_mode.as_deref(), Some("custom"));

        for bad in [progress("11", 0.5), progress("0", 0.0), progress("3", 1.5)] {
            assert!(matches!(
                save(&db, &book.id, &bad),
                Err(AppError::Invalid(_))
            ));
        }
        assert_eq!(
            books::get(&db.conn(), &book.id)
                .unwrap()
                .location
                .as_deref(),
            Some("4")
        );
        assert!(matches!(
            save(&db, "missing", &progress("1", 0.0)),
            Err(AppError::NotFound(_))
        ));
    }
}
