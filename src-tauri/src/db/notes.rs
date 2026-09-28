use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, AppResult};
use crate::models::{new_id, now_ms, Note};

const SELECT: &str = "SELECT id, book_id, page_number, content, created_at, updated_at FROM notes";

fn from_row(row: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        book_id: row.get(1)?,
        page_number: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

pub fn list_by_book(conn: &Connection, book_id: &str) -> AppResult<Vec<Note>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE book_id = ?1 ORDER BY page_number, created_at"
    ))?;
    let notes = stmt
        .query_map([book_id], from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(notes)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Note> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("note {id}")))
}

pub fn insert(
    conn: &Connection,
    book_id: &str,
    page_number: i64,
    content: &str,
) -> AppResult<Note> {
    let id = new_id();
    let now = now_ms();
    conn.execute(
        "INSERT INTO notes (id, book_id, page_number, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![id, book_id, page_number, content, now],
    )?;
    get(conn, &id)
}

pub fn update(conn: &Connection, id: &str, content: &str) -> AppResult<Note> {
    let changed = conn.execute(
        "UPDATE notes SET content = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, content, now_ms()],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("note {id}")));
    }
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{books, Database};

    fn db_with_book() -> Database {
        let db = Database::open_in_memory().unwrap();
        books::insert_importing(
            &db.conn(),
            &books::NewBook {
                id: "b",
                title: "t",
                file_path: "p",
                file_size: 1,
            },
        )
        .unwrap();
        db
    }

    #[test]
    fn crud_and_ordering() {
        let db = db_with_book();
        let conn = db.conn();
        let n1 = insert(&conn, "b", 42, "second page").unwrap();
        insert(&conn, "b", 3, "first page").unwrap();
        insert(&conn, "b", 42, "another on 42").unwrap();

        let pages: Vec<i64> = list_by_book(&conn, "b")
            .unwrap()
            .iter()
            .map(|n| n.page_number)
            .collect();
        assert_eq!(pages, vec![3, 42, 42]);

        let updated = update(&conn, &n1.id, "edited").unwrap();
        assert_eq!(updated.content, "edited");
        assert!(updated.updated_at >= n1.updated_at);

        delete(&conn, &n1.id).unwrap();
        assert_eq!(list_by_book(&conn, "b").unwrap().len(), 2);
        assert_eq!(books::get(&conn, "b").unwrap().note_count, 2);
    }

    #[test]
    fn notes_cascade_with_book() {
        let db = db_with_book();
        let conn = db.conn();
        insert(&conn, "b", 1, "x").unwrap();
        books::delete(&conn, "b").unwrap();
        assert!(list_by_book(&conn, "b").unwrap().is_empty());
    }

    #[test]
    fn note_requires_existing_book() {
        let db = Database::open_in_memory().unwrap();
        assert!(insert(&db.conn(), "ghost", 1, "x").is_err());
    }
}
