//! Page notes. Validation lives here; persistence in `db::notes`.

use crate::db::{books, notes, Database};
use crate::error::{AppError, AppResult};
use crate::models::Note;

/// Generous cap to keep a runaway paste from bloating the database.
const MAX_NOTE_LEN: usize = 20_000;

fn validate_content(content: &str) -> AppResult<&str> {
    let content = content.trim();
    if content.is_empty() {
        return Err(AppError::Invalid("note is empty".into()));
    }
    if content.chars().count() > MAX_NOTE_LEN {
        return Err(AppError::Invalid("note is too long".into()));
    }
    Ok(content)
}

pub fn create(db: &Database, book_id: &str, page_number: i64, content: &str) -> AppResult<Note> {
    let content = validate_content(content)?;
    let conn = db.conn();
    let book = books::get(&conn, book_id)?;
    if page_number < 1 || (book.page_count > 0 && page_number > book.page_count) {
        return Err(AppError::Invalid(format!("page {page_number}")));
    }
    notes::insert(&conn, book_id, page_number, content)
}

pub fn update(db: &Database, id: &str, content: &str) -> AppResult<Note> {
    let content = validate_content(content)?;
    notes::update(&db.conn(), id, content)
}

pub fn delete(db: &Database, id: &str) -> AppResult<()> {
    notes::delete(&db.conn(), id)
}

pub fn list(db: &Database, book_id: &str) -> AppResult<Vec<Note>> {
    notes::list_by_book(&db.conn(), book_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::BookMetadata;
    use crate::services::library::{self, tests::*};

    fn ready_book(pages: i64) -> (tempfile::TempDir, Database, String) {
        let (dir, db, storage) = setup();
        let book =
            library::copy_into_library(&db, &storage, &write_pdf(dir.path(), "a.pdf"), |_| {})
                .unwrap();
        let meta = BookMetadata {
            title: "a".into(),
            author: None,
            page_count: pages,
        };
        library::finalize_import(&db, &storage, &book.id, &meta).unwrap();
        (dir, db, book.id)
    }

    #[test]
    fn creates_trimmed_notes() {
        let (_dir, db, id) = ready_book(10);
        let note = create(&db, &id, 3, "  remember this \n").unwrap();
        assert_eq!(note.content, "remember this");
        assert_eq!(list(&db, &id).unwrap().len(), 1);
    }

    #[test]
    fn rejects_empty_content_and_bad_pages() {
        let (_dir, db, id) = ready_book(10);
        assert!(matches!(
            create(&db, &id, 1, "   "),
            Err(AppError::Invalid(_))
        ));
        assert!(matches!(
            create(&db, &id, 0, "x"),
            Err(AppError::Invalid(_))
        ));
        assert!(matches!(
            create(&db, &id, 11, "x"),
            Err(AppError::Invalid(_))
        ));
        assert!(matches!(
            create(&db, "missing", 1, "x"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn updates_and_deletes() {
        let (_dir, db, id) = ready_book(10);
        let note = create(&db, &id, 2, "a").unwrap();
        assert_eq!(update(&db, &note.id, "b").unwrap().content, "b");
        assert!(update(&db, &note.id, "").is_err());
        delete(&db, &note.id).unwrap();
        assert!(list(&db, &id).unwrap().is_empty());
    }
}
