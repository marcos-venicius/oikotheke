use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, AppResult};
use crate::models::{now_ms, Book, BookFormat, BookMetadata, BookStatus, ReadingProgress};

/// Columns read by `from_row`, in order.
macro_rules! book_columns {
    () => {
        "b.id, b.format, b.title, b.author, b.file_path, b.cover_path, b.page_count,
         b.location, b.progress, b.zoom_level, b.zoom_mode, b.file_size, b.status, b.removed_at,
         b.created_at, b.updated_at, b.catalog_id,
         (SELECT COUNT(*) FROM notes n WHERE n.book_id = b.id) AS note_count"
    };
}

const SELECT: &str = concat!("SELECT ", book_columns!(), " FROM books b");

fn from_row(row: &Row) -> rusqlite::Result<Book> {
    Ok(Book {
        id: row.get(0)?,
        format: BookFormat::parse(&row.get::<_, String>(1)?),
        title: row.get(2)?,
        author: row.get(3)?,
        file_path: row.get(4)?,
        cover_path: row.get(5)?,
        page_count: row.get(6)?,
        location: row.get(7)?,
        progress: row.get(8)?,
        zoom_level: row.get(9)?,
        zoom_mode: row.get(10)?,
        file_size: row.get(11)?,
        status: BookStatus::parse(&row.get::<_, String>(12)?),
        removed_at: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        catalog_id: row.get(16)?,
        note_count: row.get(17)?,
    })
}

pub struct NewBook<'a> {
    pub id: &'a str,
    pub format: BookFormat,
    pub title: &'a str,
    pub file_path: &'a str,
    pub file_size: i64,
    pub content_hash: &'a str,
    /// Set when the book was downloaded from the Discover catalog.
    pub catalog_id: Option<&'a str>,
}

pub fn insert_importing(conn: &Connection, book: &NewBook) -> AppResult<()> {
    let now = now_ms();
    conn.execute(
        "INSERT INTO books (id, format, title, file_path, file_size, content_hash, catalog_id,
                            status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'importing', ?8, ?8)",
        params![
            book.id,
            book.format.as_str(),
            book.title,
            book.file_path,
            book.file_size,
            book.content_hash,
            book.catalog_id,
            now
        ],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Book> {
    conn.query_row(&format!("{SELECT} WHERE b.id = ?1"), [id], from_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("book {id}")))
}

/// Books on the shelf (not soft-removed), most recent activity first: reading (opening a book
/// saves its position), notes, import and restore all update `updated_at`.
pub fn list_active(conn: &Connection) -> AppResult<Vec<Book>> {
    list_where(
        conn,
        "b.removed_at IS NULL ORDER BY b.updated_at DESC, b.created_at DESC",
    )
}

pub fn list_removed(conn: &Connection) -> AppResult<Vec<Book>> {
    list_where(conn, "b.removed_at IS NOT NULL ORDER BY b.removed_at DESC")
}

/// A book downloaded from this catalog entry whose file is still there, if any.
pub fn find_by_catalog_id(conn: &Connection, catalog_id: &str) -> AppResult<Option<Book>> {
    Ok(list_where_with(
        conn,
        "b.catalog_id = ?1 AND b.status != 'missing' ORDER BY b.created_at LIMIT 1",
        [catalog_id],
    )?
    .pop())
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<Book>> {
    list_where(conn, "1 = 1")
}

fn list_where(conn: &Connection, clause: &str) -> AppResult<Vec<Book>> {
    list_where_with(conn, clause, [])
}

fn list_where_with(
    conn: &Connection,
    clause: &str,
    params: impl rusqlite::Params,
) -> AppResult<Vec<Book>> {
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE {clause}"))?;
    let books = stmt
        .query_map(params, from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(books)
}

pub fn finalize(
    conn: &Connection,
    id: &str,
    meta: &BookMetadata,
    cover_path: Option<&str>,
) -> AppResult<()> {
    let changed = conn.execute(
        "UPDATE books SET title = ?2, author = ?3, page_count = ?4, cover_path = ?5,
                status = 'ready', updated_at = ?6
         WHERE id = ?1",
        params![
            id,
            meta.title,
            meta.author,
            meta.page_count,
            cover_path,
            now_ms()
        ],
    )?;
    ensure_changed(changed, id)
}

pub fn set_status(conn: &Connection, id: &str, status: BookStatus) -> AppResult<()> {
    let changed = conn.execute(
        "UPDATE books SET status = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, status.as_str(), now_ms()],
    )?;
    ensure_changed(changed, id)
}

pub fn set_removed(conn: &Connection, id: &str, removed: bool) -> AppResult<()> {
    let now = now_ms();
    let removed_at = removed.then_some(now);
    let changed = conn.execute(
        "UPDATE books SET removed_at = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, removed_at, now],
    )?;
    ensure_changed(changed, id)
}

/// Stores a reading position. The caller validates it (`services::progress`).
pub fn update_progress(conn: &Connection, id: &str, progress: &ReadingProgress) -> AppResult<()> {
    let changed = conn.execute(
        "UPDATE books SET location = ?2, progress = ?3, zoom_level = ?4, zoom_mode = ?5,
                updated_at = ?6
         WHERE id = ?1",
        params![
            id,
            progress.location,
            progress.progress,
            progress.zoom_level,
            progress.zoom_mode,
            now_ms()
        ],
    )?;
    ensure_changed(changed, id)
}

/// A book that may hold the same content as a new file: same size, known hash or not yet.
pub struct Candidate {
    pub book: Book,
    pub content_hash: Option<String>,
}

/// Books of exactly `size` bytes, including soft-removed ones.
pub fn same_size(conn: &Connection, size: i64) -> AppResult<Vec<Candidate>> {
    let mut stmt = conn.prepare(concat!(
        "SELECT ",
        book_columns!(),
        ", b.content_hash FROM books b WHERE b.file_size = ?1"
    ))?;
    let rows = stmt
        .query_map([size], |row| {
            Ok(Candidate {
                book: from_row(row)?,
                content_hash: row.get(18)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn set_content_hash(conn: &Connection, id: &str, hash: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE books SET content_hash = ?2 WHERE id = ?1",
        params![id, hash],
    )?;
    Ok(())
}

/// Records activity on a book without changing anything else (e.g. its notes changed).
pub fn touch(conn: &Connection, id: &str) -> AppResult<()> {
    let changed = conn.execute(
        "UPDATE books SET updated_at = ?2 WHERE id = ?1",
        params![id, now_ms()],
    )?;
    ensure_changed(changed, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM books WHERE id = ?1", [id])?;
    Ok(())
}

fn ensure_changed(changed: usize, id: &str) -> AppResult<()> {
    if changed == 0 {
        return Err(AppError::NotFound(format!("book {id}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    pub fn seed(conn: &Connection, id: &str) {
        insert_importing(
            conn,
            &NewBook {
                id,
                format: BookFormat::Pdf,
                title: "draft",
                file_path: "library/x/book.pdf",
                file_size: 10,
                content_hash: id,
                catalog_id: None,
            },
        )
        .unwrap();
    }

    #[test]
    fn insert_finalize_and_get() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn();
        seed(&conn, "a");
        assert_eq!(get(&conn, "a").unwrap().status, BookStatus::Importing);

        let meta = BookMetadata {
            title: "Clean Code".into(),
            author: Some("Bob".into()),
            page_count: 400,
        };
        finalize(&conn, "a", &meta, Some("library/a/cover.jpg")).unwrap();
        let book = get(&conn, "a").unwrap();
        assert_eq!(book.status, BookStatus::Ready);
        assert_eq!(book.title, "Clean Code");
        assert_eq!(book.page_count, 400);
        assert_eq!(book.format, BookFormat::Pdf);
        assert_eq!(book.location, None);
        assert_eq!(book.progress, 0.0);
    }

    #[test]
    fn stores_progress() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn();
        seed(&conn, "a");
        let progress = ReadingProgress {
            location: "7".into(),
            progress: 0.7,
            zoom_level: Some(1.5),
            zoom_mode: Some("custom".into()),
        };
        update_progress(&conn, "a", &progress).unwrap();
        let book = get(&conn, "a").unwrap();
        assert_eq!(book.location.as_deref(), Some("7"));
        assert_eq!(book.progress, 0.7);
        assert_eq!(book.zoom_level, Some(1.5));
        assert_eq!(book.zoom_mode.as_deref(), Some("custom"));
    }

    #[test]
    fn shelf_lists_most_recent_activity_first() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn();
        for id in ["old", "mid", "new"] {
            seed(&conn, id);
        }
        // Imported in this order, but read in another.
        let times = [("old", 1, 300), ("mid", 2, 100), ("new", 3, 200)];
        for (id, created, updated) in times {
            conn.execute(
                "UPDATE books SET created_at = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, created, updated],
            )
            .unwrap();
        }
        let order = |conn: &Connection| -> Vec<String> {
            list_active(conn)
                .unwrap()
                .into_iter()
                .map(|b| b.id)
                .collect()
        };
        assert_eq!(order(&conn), ["old", "new", "mid"]);

        touch(&conn, "mid").unwrap();
        assert_eq!(order(&conn), ["mid", "old", "new"]);
        assert!(matches!(touch(&conn, "nope"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn soft_remove_and_restore() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn();
        seed(&conn, "a");
        set_removed(&conn, "a", true).unwrap();
        assert!(list_active(&conn).unwrap().is_empty());
        assert_eq!(list_removed(&conn).unwrap().len(), 1);
        set_removed(&conn, "a", false).unwrap();
        assert_eq!(list_active(&conn).unwrap().len(), 1);
    }

    #[test]
    fn missing_book_is_not_found() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn();
        assert!(matches!(get(&conn, "nope"), Err(AppError::NotFound(_))));
        assert!(matches!(
            set_removed(&conn, "nope", true),
            Err(AppError::NotFound(_))
        ));
    }
}
