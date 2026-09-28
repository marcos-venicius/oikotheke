//! Startup consistency check between the database and the managed files.

use std::collections::HashSet;

use crate::db::{books, Database};
use crate::error::AppResult;
use crate::models::BookStatus;
use crate::storage::{self, EntryKind, Storage};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct ReconcileReport {
    pub leftovers_removed: usize,
    pub orphans_removed: usize,
    pub rows_removed: usize,
    pub marked_missing: usize,
    pub restored: usize,
}

pub fn reconcile(db: &Database, storage: &Storage) -> AppResult<ReconcileReport> {
    let mut report = ReconcileReport::default();
    let conn = db.conn();
    let rows = books::list_all(&conn)?;
    let known: HashSet<&str> = rows.iter().map(|b| b.id.as_str()).collect();

    // Interrupted staging/trash operations and directories without a row.
    for entry in storage.scan()? {
        match entry.kind {
            EntryKind::Leftover => {
                storage::remove_dir(&entry.path)?;
                report.leftovers_removed += 1;
            }
            EntryKind::Book(id) if !known.contains(id.as_str()) => {
                storage::remove_dir(&entry.path)?;
                report.orphans_removed += 1;
            }
            EntryKind::Book(_) => {}
        }
    }

    for book in rows {
        let exists = storage.resolve(&book.file_path).is_file();
        match (book.status, exists) {
            // Import interrupted before its file was in place: nothing to resume.
            (BookStatus::Importing, false) => {
                books::delete(&conn, &book.id)?;
                storage::remove_dir(&storage.book_dir(&book.id)?)?;
                report.rows_removed += 1;
            }
            (BookStatus::Ready, false) => {
                books::set_status(&conn, &book.id, BookStatus::Missing)?;
                report.marked_missing += 1;
            }
            (BookStatus::Missing, true) => {
                books::set_status(&conn, &book.id, BookStatus::Ready)?;
                report.restored += 1;
            }
            // `importing` rows with a file are resumed by the UI (metadata + cover).
            _ => {}
        }
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;
    use crate::models::{new_id, BookMetadata};
    use crate::services::library::{self, tests::*};

    #[test]
    fn cleans_leftovers_and_orphans() {
        let (_dir, db, storage) = setup();
        fs::create_dir_all(storage.staging_dir(&new_id()).unwrap()).unwrap();
        fs::create_dir_all(storage.trash_dir(&new_id()).unwrap()).unwrap();
        fs::create_dir_all(storage.book_dir(&new_id()).unwrap()).unwrap();

        let report = reconcile(&db, &storage).unwrap();
        assert_eq!(report.leftovers_removed, 2);
        assert_eq!(report.orphans_removed, 1);
        assert!(storage.scan().unwrap().is_empty());
    }

    #[test]
    fn marks_missing_and_restores() {
        let (dir, db, storage) = setup();
        let book =
            library::copy_into_library(&db, &storage, &write_pdf(dir.path(), "a.pdf"), |_| {})
                .unwrap();
        let meta = BookMetadata {
            title: "a".into(),
            author: None,
            page_count: 1,
        };
        library::finalize_import(&db, &storage, &book.id, &meta).unwrap();

        let pdf = storage.resolve(&book.file_path);
        let backup = dir.path().join("backup.pdf");
        fs::rename(&pdf, &backup).unwrap();
        assert_eq!(reconcile(&db, &storage).unwrap().marked_missing, 1);
        assert_eq!(
            books::get(&db.conn(), &book.id).unwrap().status,
            BookStatus::Missing
        );

        fs::rename(&backup, &pdf).unwrap();
        assert_eq!(reconcile(&db, &storage).unwrap().restored, 1);
        assert_eq!(
            books::get(&db.conn(), &book.id).unwrap().status,
            BookStatus::Ready
        );
    }

    #[test]
    fn keeps_resumable_imports_and_drops_broken_ones() {
        let (dir, db, storage) = setup();
        let resumable =
            library::copy_into_library(&db, &storage, &write_pdf(dir.path(), "a.pdf"), |_| {})
                .unwrap();
        let broken =
            library::copy_into_library(&db, &storage, &write_pdf(dir.path(), "b.pdf"), |_| {})
                .unwrap();
        fs::remove_file(storage.resolve(&broken.file_path)).unwrap();

        let report = reconcile(&db, &storage).unwrap();
        assert_eq!(report.rows_removed, 1);
        assert!(books::get(&db.conn(), &resumable.id).is_ok());
        assert!(books::get(&db.conn(), &broken.id).is_err());
    }

    #[test]
    fn consistent_state_is_untouched() {
        let (dir, db, storage) = setup();
        library::copy_into_library(&db, &storage, &write_pdf(dir.path(), "a.pdf"), |_| {}).unwrap();
        assert_eq!(
            reconcile(&db, &storage).unwrap(),
            ReconcileReport::default()
        );
    }
}
