use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, AppResult};
use crate::models::{now_ms, Book, BookMetadata, BookStatus};

const SELECT: &str = "
    SELECT b.id, b.title, b.author, b.file_path, b.cover_path, b.page_count, b.current_page,
           b.zoom_level, b.file_size, b.status, b.removed_at, b.created_at, b.updated_at,
           (SELECT COUNT(*) FROM notes n WHERE n.book_id = b.id) AS note_count
    FROM books b";

fn from_row(row: &Row) -> rusqlite::Result<Book> {
    Ok(Book {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        file_path: row.get(3)?,
        cover_path: row.get(4)?,
        page_count: row.get(5)?,
        current_page: row.get(6)?,
        zoom_level: row.get(7)?,
        file_size: row.get(8)?,
        status: BookStatus::parse(&row.get::<_, String>(9)?),
        removed_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        note_count: row.get(13)?,
    })
}

pub struct NewBook<'a> {
    pub id: &'a str,
    pub title: &'a str,
    pub file_path: &'a str,
    pub file_size: i64,
}

pub fn insert_importing(conn: &Connection, book: &NewBook) -> AppResult<()> {
    let now = now_ms();
    conn.execute(
        "INSERT INTO books (id, title, file_path, file_size, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'importing', ?5, ?5)",
        params![book.id, book.title, book.file_path, book.file_size, now],
    )?;
    Ok(())
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Book> {
    conn.query_row(&format!("{SELECT} WHERE b.id = ?1"), [id], from_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("book {id}")))
}

/// Books on the shelf (not soft-removed), most recently added first.
pub fn list_active(conn: &Connection) -> AppResult<Vec<Book>> {
    list_where(conn, "b.removed_at IS NULL ORDER BY b.created_at DESC")
}

pub fn list_removed(conn: &Connection) -> AppResult<Vec<Book>> {
    list_where(conn, "b.removed_at IS NOT NULL ORDER BY b.removed_at DESC")
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<Book>> {
    list_where(conn, "1 = 1")
}

fn list_where(conn: &Connection, clause: &str) -> AppResult<Vec<Book>> {
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE {clause}"))?;
    let books = stmt
        .query_map([], from_row)?
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

pub fn update_progress(
    conn: &Connection,
    id: &str,
    current_page: i64,
    zoom_level: Option<f64>,
) -> AppResult<()> {
    let changed = conn.execute(
        "UPDATE books SET current_page = MAX(1, MIN(?2, MAX(page_count, 1))),
                zoom_level = ?3, updated_at = ?4
         WHERE id = ?1",
        params![id, current_page, zoom_level, now_ms()],
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
                title: "draft",
                file_path: "library/x/book.pdf",
                file_size: 10,
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
        finalize(&conn, "a", &meta, Some("library/a/cover.png")).unwrap();
        let book = get(&conn, "a").unwrap();
        assert_eq!(book.status, BookStatus::Ready);
        assert_eq!(book.title, "Clean Code");
        assert_eq!(book.page_count, 400);
        assert_eq!(book.current_page, 1);
    }

    #[test]
    fn progress_is_clamped_to_page_count() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn();
        seed(&conn, "a");
        let meta = BookMetadata {
            title: "t".into(),
            author: None,
            page_count: 10,
        };
        finalize(&conn, "a", &meta, None).unwrap();

        update_progress(&conn, "a", 42, Some(1.5)).unwrap();
        assert_eq!(get(&conn, "a").unwrap().current_page, 10);
        update_progress(&conn, "a", -3, None).unwrap();
        assert_eq!(get(&conn, "a").unwrap().current_page, 1);
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
