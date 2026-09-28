use std::collections::HashMap;

use rusqlite::{params, Connection};

use crate::error::AppResult;

pub fn all(conn: &Connection) -> AppResult<HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn set(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[test]
    fn upsert() {
        let db = Database::open_in_memory().unwrap();
        let conn = db.conn();
        set(&conn, "theme", "dark").unwrap();
        set(&conn, "theme", "light").unwrap();
        assert_eq!(
            all(&conn).unwrap().get("theme").map(String::as_str),
            Some("light")
        );
    }
}
