use rusqlite::Connection;

use crate::error::AppResult;

/// Ordered schema migrations. Index + 1 is the `user_version` after applying it.
/// Never edit an existing entry; append a new one instead.
const MIGRATIONS: &[&str] = &[
    // 1: initial schema
    r#"
CREATE TABLE books (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    author       TEXT,
    file_path    TEXT NOT NULL,
    cover_path   TEXT,
    page_count   INTEGER NOT NULL DEFAULT 0,
    current_page INTEGER NOT NULL DEFAULT 1,
    zoom_level   REAL,
    file_size    INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL CHECK (status IN ('importing', 'ready', 'missing')),
    removed_at   INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
);

CREATE TABLE notes (
    id          TEXT PRIMARY KEY,
    book_id     TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    content     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_notes_book_page ON notes(book_id, page_number);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#,
    // 2: how the reader sizes pages ('fit-page' | 'fit-width' | 'custom'; custom uses zoom_level).
    "ALTER TABLE books ADD COLUMN zoom_mode TEXT;",
    // 3: format-independent positions. A location is opaque text interpreted per format (a page
    // number for PDF, an EPUB CFI for EPUB); progress (0..1) feeds the shelf.
    r#"
ALTER TABLE books ADD COLUMN format TEXT NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf', 'epub'));
ALTER TABLE books ADD COLUMN location TEXT;
ALTER TABLE books ADD COLUMN progress REAL NOT NULL DEFAULT 0;
UPDATE books SET
    location = CAST(current_page AS TEXT),
    progress = CASE WHEN page_count > 1 AND current_page > 1
                    THEN MIN(1.0, CAST(current_page AS REAL) / page_count)
                    ELSE 0 END;
ALTER TABLE books DROP COLUMN current_page;

ALTER TABLE notes ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN label TEXT;
UPDATE notes SET location = CAST(page_number AS TEXT);
DROP INDEX idx_notes_book_page;
ALTER TABLE notes DROP COLUMN page_number;
CREATE INDEX idx_notes_book ON notes(book_id);
"#,
    // 4: content hash (SHA-256) to refuse importing the same book twice. Older rows get theirs
    // lazily, when a file of the same size is imported.
    r#"
ALTER TABLE books ADD COLUMN content_hash TEXT;
CREATE INDEX idx_books_size ON books(file_size);
"#,
    // 5: the Discover catalog entry a book was downloaded from (null for files the user picked).
    r#"
ALTER TABLE books ADD COLUMN catalog_id TEXT;
CREATE INDEX idx_books_catalog ON books(catalog_id);
"#,
];

pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    migrate_to(conn, MIGRATIONS.len())
}

fn migrate_to(conn: &mut Connection, target: usize) -> AppResult<()> {
    let version: usize = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for (index, sql) in MIGRATIONS.iter().enumerate().take(target).skip(version) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index + 1)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locations_migration_keeps_pdf_positions_and_notes() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrate_to(&mut conn, 2).unwrap();
        conn.execute_batch(
            "INSERT INTO books (id, title, file_path, page_count, current_page, zoom_mode,
                                status, created_at, updated_at)
             VALUES ('reading', 'r', 'p', 601, 29, 'fit-height', 'ready', 1, 2),
                    ('new', 'n', 'p', 10, 1, NULL, 'ready', 1, 2),
                    ('importing', 'i', 'p', 0, 1, NULL, 'importing', 1, 2),
                    ('done', 'd', 'p', 10, 10, NULL, 'ready', 1, 2);
             INSERT INTO notes (id, book_id, page_number, content, created_at, updated_at)
             VALUES ('n1', 'reading', 42, 'first', 5, 6),
                    ('n2', 'reading', 42, 'second', 7, 8),
                    ('n3', 'new', 3, 'third', 9, 9);",
        )
        .unwrap();

        migrate(&mut conn).unwrap();

        let book = |id: &str| -> (String, Option<String>, f64, i64, Option<String>) {
            conn.query_row(
                "SELECT format, location, progress, page_count, zoom_mode FROM books WHERE id = ?1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
            )
            .unwrap()
        };
        let (format, location, progress, pages, zoom) = book("reading");
        assert_eq!(format, "pdf");
        assert_eq!(location.as_deref(), Some("29"));
        assert!((progress - 29.0 / 601.0).abs() < 1e-9);
        assert_eq!((pages, zoom.as_deref()), (601, Some("fit-height")));
        assert_eq!(book("new").2, 0.0);
        assert_eq!(book("importing").2, 0.0);
        assert_eq!(book("done").2, 1.0);

        let notes: Vec<(String, String, String, Option<String>, i64, i64)> = conn
            .prepare("SELECT id, location, content, label, created_at, updated_at FROM notes ORDER BY id")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(
            notes,
            vec![
                ("n1".into(), "42".into(), "first".into(), None, 5, 6),
                ("n2".into(), "42".into(), "second".into(), None, 7, 8),
                ("n3".into(), "3".into(), "third".into(), None, 9, 9),
            ]
        );

        let old_columns: i64 = conn
            .query_row(
                "SELECT (SELECT COUNT(*) FROM pragma_table_info('books') WHERE name = 'current_page')
                      + (SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name = 'page_number')",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(old_columns, 0);
        assert!(conn
            .execute("UPDATE books SET format = 'mobi' WHERE id = 'new'", [])
            .is_err());
        // Notes still cascade with their book.
        conn.execute("DELETE FROM books WHERE id = 'reading'", [])
            .unwrap();
        let left: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
            .unwrap();
        assert_eq!(left, 1);
    }

    #[test]
    fn catalog_migration_leaves_existing_books_unlinked() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate_to(&mut conn, 4).unwrap();
        conn.execute_batch(
            "INSERT INTO books (id, title, file_path, status, created_at, updated_at)
             VALUES ('a', 'a', 'p', 'ready', 1, 2);",
        )
        .unwrap();
        migrate(&mut conn).unwrap();
        let catalog_id: Option<String> = conn
            .query_row("SELECT catalog_id FROM books WHERE id = 'a'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(catalog_id, None);
    }
}
