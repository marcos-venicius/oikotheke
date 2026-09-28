use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, AppResult};
use crate::models::{new_id, now_ms, Note};

const SELECT: &str =
    "SELECT id, book_id, location, label, content, created_at, updated_at FROM notes";

fn from_row(row: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        book_id: row.get(1)?,
        location: row.get(2)?,
        label: row.get(3)?,
        content: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

/// Notes in creation order. Ordering by location depends on the format, so the UI does it.
pub fn list_by_book(conn: &Connection, book_id: &str) -> AppResult<Vec<Note>> {
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE book_id = ?1 ORDER BY created_at, rowid"
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

pub struct NewNote<'a> {
    pub book_id: &'a str,
    pub location: &'a str,
    pub label: Option<&'a str>,
    pub content: &'a str,
}

pub fn insert(conn: &Connection, note: &NewNote) -> AppResult<Note> {
    let id = new_id();
    let now = now_ms();
    conn.execute(
        "INSERT INTO notes (id, book_id, location, label, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            id,
            note.book_id,
            note.location,
            note.label,
            note.content,
            now
        ],
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
                format: crate::models::BookFormat::Pdf,
                title: "t",
                file_path: "p",
                file_size: 1,
            },
        )
        .unwrap();
        db
    }

    fn note<'a>(book_id: &'a str, location: &'a str, content: &'a str) -> NewNote<'a> {
        NewNote {
            book_id,
            location,
            label: None,
            content,
        }
    }

    #[test]
    fn crud_and_ordering() {
        let db = db_with_book();
        let conn = db.conn();
        let n1 = insert(&conn, &note("b", "42", "second page")).unwrap();
        insert(
            &conn,
            &NewNote {
                label: Some("Chapter 1"),
                ..note("b", "3", "first page")
            },
        )
        .unwrap();
        insert(&conn, &note("b", "42", "another on 42")).unwrap();

        let list = list_by_book(&conn, "b").unwrap();
        let locations: Vec<&str> = list.iter().map(|n| n.location.as_str()).collect();
        assert_eq!(locations, vec!["42", "3", "42"]);
        assert_eq!(list[1].label.as_deref(), Some("Chapter 1"));

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
        insert(&conn, &note("b", "1", "x")).unwrap();
        books::delete(&conn, "b").unwrap();
        assert!(list_by_book(&conn, "b").unwrap().is_empty());
    }

    #[test]
    fn note_requires_existing_book() {
        let db = Database::open_in_memory().unwrap();
        assert!(insert(&db.conn(), &note("ghost", "1", "x")).is_err());
    }
}
