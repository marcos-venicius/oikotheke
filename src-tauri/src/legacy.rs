//! One-time migration from the PDF Shelf era: moves the app-data dir away from the legacy
//! identifier and renames the database file.
//!
//! Runs before Tauri starts, because plugins and the webview create the new data dir early.
//! Every step is a single atomic rename, skipped when its target already exists, so it is
//! idempotent and a crash leaves either the old or the new state. Nothing is ever deleted
//! except the emptied WAL side files of the legacy database.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

pub const LEGACY_IDENTIFIER: &str = "com.pdfshelf.app";
pub const LEGACY_DATABASE_FILE: &str = "pdf-shelf.db";

/// What the migration did. Logged from `setup`, once the log plugin is running.
#[derive(Debug, Default)]
pub struct Report {
    pub info: Vec<String>,
    pub warnings: Vec<String>,
}

impl Report {
    pub fn log(&self) {
        for message in &self.info {
            log::info!("legacy migration: {message}");
        }
        for message in &self.warnings {
            log::warn!("legacy migration: {message}");
        }
    }
}

/// Migrates `<data-dir>/com.pdfshelf.app` to `<data-dir>/<identifier>` and the database inside
/// it. `<data-dir>` is the platform data dir, the same base Tauri uses for `app_data_dir`.
pub fn migrate(identifier: &str, database_file: &str) -> Report {
    let mut report = Report::default();
    let Some(base) = dirs::data_dir() else {
        return report;
    };
    migrate_in(&base, identifier, database_file, &mut report);
    report
}

fn migrate_in(base: &Path, identifier: &str, database_file: &str, report: &mut Report) {
    let data_dir = base.join(identifier);
    match migrate_dir(&base.join(LEGACY_IDENTIFIER), &data_dir) {
        Ok(Some(message)) => report.info.push(message),
        Ok(None) => {}
        Err(message) => report.warnings.push(message),
    }
    if data_dir.is_dir() {
        match migrate_database(&data_dir, database_file) {
            Ok(Some(message)) => report.info.push(message),
            Ok(None) => {}
            Err(message) => report.warnings.push(message),
        }
    }
}

fn migrate_dir(legacy: &Path, target: &Path) -> Result<Option<String>, String> {
    if !legacy.is_dir() {
        return Ok(None);
    }
    if exists(target).map_err(|e| format!("cannot check {}: {e}", target.display()))? {
        return Err(format!(
            "{} was left in place because {} already exists",
            legacy.display(),
            target.display()
        ));
    }
    fs::rename(legacy, target).map_err(|e| {
        format!(
            "moving {} to {} failed: {e}",
            legacy.display(),
            target.display()
        )
    })?;
    Ok(Some(format!(
        "moved {} to {}",
        legacy.display(),
        target.display()
    )))
}

fn migrate_database(data_dir: &Path, database_file: &str) -> Result<Option<String>, String> {
    let legacy = data_dir.join(LEGACY_DATABASE_FILE);
    let target = data_dir.join(database_file);
    let (wal, shm) = (side_file(&legacy, "-wal"), side_file(&legacy, "-shm"));
    let fail = |step: &str, e: &dyn std::fmt::Display| {
        format!("{step} for {} failed: {e}", legacy.display())
    };

    if !legacy.exists() {
        // Leftovers from an interrupted run: only remove them when they hold no data.
        remove_empty_side_files(&wal, &shm).map_err(|e| fail("cleanup", &e))?;
        return Ok(None);
    }
    if exists(&target).map_err(|e| fail("check", &e))? {
        return Err(format!(
            "{} was left in place because {} already exists",
            legacy.display(),
            target.display()
        ));
    }

    // The WAL may hold the most recent writes. Leaving WAL mode checkpoints everything into the
    // main file and deletes the WAL; it only succeeds when no other connection is open.
    {
        let conn = Connection::open(&legacy).map_err(|e| fail("open", &e))?;
        let mode: String = conn
            .pragma_update_and_check(None, "journal_mode", "DELETE", |row| row.get(0))
            .map_err(|e| fail("checkpoint", &e))?;
        if !mode.eq_ignore_ascii_case("delete") {
            return Err(fail("checkpoint", &format!("journal mode is still {mode}")));
        }
    }
    if file_len(&wal).map_err(|e| fail("check", &e))? > 0 {
        return Err(fail("checkpoint", &"the WAL still holds data"));
    }

    fs::rename(&legacy, &target).map_err(|e| fail("rename", &e))?;
    remove_empty_side_files(&wal, &shm).map_err(|e| fail("cleanup", &e))?;
    Ok(Some(format!(
        "renamed {} to {}",
        legacy.display(),
        target.display()
    )))
}

fn side_file(db: &Path, suffix: &str) -> PathBuf {
    let mut name = db.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

fn remove_empty_side_files(wal: &Path, shm: &Path) -> io::Result<()> {
    if file_len(wal)? > 0 {
        return Ok(());
    }
    remove_if_exists(wal)?;
    remove_if_exists(shm)
}

fn exists(path: &Path) -> io::Result<bool> {
    path.try_exists()
}

/// Length of a file, 0 when it does not exist.
fn file_len(path: &Path) -> io::Result<u64> {
    match fs::metadata(path) {
        Ok(meta) => Ok(meta.len()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(0),
        Err(e) => Err(e),
    }
}

fn remove_if_exists(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID: &str = "io.example.new";
    const DB: &str = "new.db";

    fn run(base: &Path) -> Report {
        let mut report = Report::default();
        migrate_in(base, ID, DB, &mut report);
        report
    }

    /// Creates a legacy dir whose database has committed rows only in the WAL, as left behind
    /// by a crash (the files are copied while the writing connection is still open).
    fn legacy_with_wal(base: &Path, rows: i64) -> PathBuf {
        let legacy = base.join(LEGACY_IDENTIFIER);
        fs::create_dir_all(legacy.join("library/book-1")).unwrap();
        fs::write(legacy.join("library/book-1/book.pdf"), b"%PDF-1.7").unwrap();

        let scratch = base.join("scratch");
        fs::create_dir_all(&scratch).unwrap();
        let db = scratch.join(LEGACY_DATABASE_FILE);
        let conn = Connection::open(&db).unwrap();
        conn.pragma_update(None, "journal_mode", "WAL").unwrap();
        conn.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
        conn.execute_batch("CREATE TABLE t (n INTEGER)").unwrap();
        for n in 0..rows {
            conn.execute("INSERT INTO t VALUES (?1)", [n]).unwrap();
        }
        for suffix in ["", "-wal", "-shm"] {
            let from = side_file(&db, suffix);
            fs::copy(&from, side_file(&legacy.join(LEGACY_DATABASE_FILE), suffix)).unwrap();
        }
        assert!(
            file_len(&side_file(&db, "-wal")).unwrap() > 0,
            "rows must be in the WAL"
        );
        drop(conn);
        legacy
    }

    fn count_rows(db: &Path) -> i64 {
        Connection::open(db)
            .unwrap()
            .query_row("SELECT count(*) FROM t", [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn moves_dir_and_database_keeping_wal_data() {
        let tmp = tempfile::tempdir().unwrap();
        legacy_with_wal(tmp.path(), 50);

        let report = run(tmp.path());
        assert!(report.warnings.is_empty(), "{:?}", report.warnings);
        assert_eq!(report.info.len(), 2);

        let data = tmp.path().join(ID);
        assert!(!tmp.path().join(LEGACY_IDENTIFIER).exists());
        assert_eq!(
            fs::read(data.join("library/book-1/book.pdf")).unwrap(),
            b"%PDF-1.7"
        );
        assert_eq!(count_rows(&data.join(DB)), 50);
        for suffix in ["", "-wal", "-shm"] {
            assert!(!side_file(&data.join(LEGACY_DATABASE_FILE), suffix).exists());
        }
    }

    #[test]
    fn second_run_is_a_no_op() {
        let tmp = tempfile::tempdir().unwrap();
        legacy_with_wal(tmp.path(), 3);
        run(tmp.path());

        let report = run(tmp.path());
        assert!(report.info.is_empty() && report.warnings.is_empty());
        assert_eq!(count_rows(&tmp.path().join(ID).join(DB)), 3);
    }

    #[test]
    fn nothing_to_do_without_legacy_data() {
        let tmp = tempfile::tempdir().unwrap();
        let report = run(tmp.path());
        assert!(report.info.is_empty() && report.warnings.is_empty());
        assert!(!tmp.path().join(ID).exists());
    }

    #[test]
    fn never_merges_into_an_existing_data_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let legacy = legacy_with_wal(tmp.path(), 5);
        fs::create_dir_all(tmp.path().join(ID).join("library")).unwrap();

        let report = run(tmp.path());
        assert_eq!(report.warnings.len(), 1);
        assert!(legacy.join(LEGACY_DATABASE_FILE).exists());
        assert_eq!(count_rows(&legacy.join(LEGACY_DATABASE_FILE)), 5);
        assert!(!tmp.path().join(ID).join(DB).exists());
    }

    #[test]
    fn keeps_legacy_database_when_new_one_exists() {
        let tmp = tempfile::tempdir().unwrap();
        legacy_with_wal(tmp.path(), 5);
        fs::rename(tmp.path().join(LEGACY_IDENTIFIER), tmp.path().join(ID)).unwrap();
        let data = tmp.path().join(ID);
        fs::write(data.join(DB), b"").unwrap();

        let report = run(tmp.path());
        assert_eq!(report.warnings.len(), 1);
        assert!(side_file(&data.join(LEGACY_DATABASE_FILE), "-wal").exists());
        assert_eq!(count_rows(&data.join(LEGACY_DATABASE_FILE)), 5);
    }

    #[test]
    fn resumes_after_crash_between_dir_and_database_steps() {
        let tmp = tempfile::tempdir().unwrap();
        legacy_with_wal(tmp.path(), 7);
        fs::rename(tmp.path().join(LEGACY_IDENTIFIER), tmp.path().join(ID)).unwrap();

        let report = run(tmp.path());
        assert!(report.warnings.is_empty(), "{:?}", report.warnings);
        assert_eq!(count_rows(&tmp.path().join(ID).join(DB)), 7);
    }

    #[test]
    fn refuses_while_the_legacy_database_is_in_use() {
        let tmp = tempfile::tempdir().unwrap();
        legacy_with_wal(tmp.path(), 4);
        fs::rename(tmp.path().join(LEGACY_IDENTIFIER), tmp.path().join(ID)).unwrap();
        let legacy_db = tmp.path().join(ID).join(LEGACY_DATABASE_FILE);
        let conn = Connection::open(&legacy_db).unwrap();
        conn.query_row("SELECT count(*) FROM t", [], |row| row.get::<_, i64>(0))
            .unwrap();

        let report = run(tmp.path());
        assert_eq!(report.warnings.len(), 1, "{:?}", report.info);
        drop(conn);
        assert!(legacy_db.exists());
        assert!(!tmp.path().join(ID).join(DB).exists());
        assert_eq!(count_rows(&legacy_db), 4);
    }
}
