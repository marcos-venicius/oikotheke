use rusqlite::Connection;

use crate::error::AppResult;

/// Ordered schema migrations. Index + 1 is the `user_version` after applying it.
/// Never edit an existing entry; append a new one instead.
const MIGRATIONS: &[&str] = &[r#"
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
"#];

pub fn migrate(conn: &mut Connection) -> AppResult<()> {
    let version: usize = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(version) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", index + 1)?;
        tx.commit()?;
    }
    Ok(())
}
