//! Notes at a reading location. Validation lives here; persistence in `db::notes`.

use crate::db::{books, notes, Database};
use crate::error::{AppError, AppResult};
use crate::models::Note;
use crate::services::location;

/// Generous cap to keep a runaway paste from bloating the database.
const MAX_NOTE_LEN: usize = 20_000;
/// Labels are short display text such as a chapter title.
const MAX_LABEL_LEN: usize = 200;

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

/// Blank labels are dropped; overlong ones are cut rather than rejected.
fn normalize_label(label: Option<&str>) -> Option<String> {
    let label = label?.trim();
    (!label.is_empty()).then(|| label.chars().take(MAX_LABEL_LEN).collect())
}

pub fn create(
    db: &Database,
    book_id: &str,
    location: &str,
    label: Option<&str>,
    content: &str,
) -> AppResult<Note> {
    let content = validate_content(content)?;
    let conn = db.conn();
    let book = books::get(&conn, book_id)?;
    let location = location::validate(&book, location)?;
    let label = normalize_label(label);
    let note = notes::insert(
        &conn,
        &notes::NewNote {
            book_id,
            location: &location,
            label: label.as_deref(),
            content,
        },
    )?;
    // Writing notes counts as reading activity (the shelf is ordered by it).
    books::touch(&conn, book_id)?;
    Ok(note)
}

pub fn update(db: &Database, id: &str, content: &str) -> AppResult<Note> {
    let content = validate_content(content)?;
    let conn = db.conn();
    let note = notes::update(&conn, id, content)?;
    books::touch(&conn, &note.book_id)?;
    Ok(note)
}

pub fn delete(db: &Database, id: &str) -> AppResult<()> {
    let conn = db.conn();
    let note = match notes::get(&conn, id) {
        Ok(note) => note,
        // Already gone: deleting stays idempotent.
        Err(AppError::NotFound(_)) => return Ok(()),
        Err(err) => return Err(err),
    };
    notes::delete(&conn, id)?;
    books::touch(&conn, &note.book_id)
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
        let note = create(&db, &id, "3", Some("  "), "  remember this \n").unwrap();
        assert_eq!(note.content, "remember this");
        assert_eq!(note.location, "3");
        assert_eq!(note.label, None);
        let long = "x".repeat(MAX_LABEL_LEN + 50);
        let labelled = create(&db, &id, "4", Some(&long), "y").unwrap();
        assert_eq!(labelled.label.unwrap().len(), MAX_LABEL_LEN);
        assert_eq!(list(&db, &id).unwrap().len(), 2);
    }

    #[test]
    fn rejects_empty_content_and_bad_locations() {
        let (_dir, db, id) = ready_book(10);
        for (location, content) in [("1", "   "), ("0", "x"), ("11", "x"), ("page 2", "x")] {
            assert!(matches!(
                create(&db, &id, location, None, content),
                Err(AppError::Invalid(_))
            ));
        }
        assert!(matches!(
            create(&db, "missing", "1", None, "x"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn note_changes_count_as_book_activity() {
        let (_dir, db, id) = ready_book(10);
        let activity = |db: &Database| books::get(&db.conn(), &id).unwrap().updated_at;
        let reset = |db: &Database| {
            db.conn()
                .execute("UPDATE books SET updated_at = 0", [])
                .unwrap();
        };

        reset(&db);
        let note = create(&db, &id, "1", None, "a").unwrap();
        assert!(activity(&db) > 0);
        reset(&db);
        update(&db, &note.id, "b").unwrap();
        assert!(activity(&db) > 0);
        reset(&db);
        delete(&db, &note.id).unwrap();
        assert!(activity(&db) > 0);
        delete(&db, &note.id).unwrap(); // idempotent
    }

    #[test]
    fn updates_and_deletes() {
        let (_dir, db, id) = ready_book(10);
        let note = create(&db, &id, "2", None, "a").unwrap();
        assert_eq!(update(&db, &note.id, "b").unwrap().content, "b");
        assert!(update(&db, &note.id, "").is_err());
        delete(&db, &note.id).unwrap();
        assert!(list(&db, &id).unwrap().is_empty());
    }
}
