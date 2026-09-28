//! Managed file storage: `<app-data>/library/<book-id>/{book.pdf, cover.jpg}`.
//!
//! Paths persisted in the database are relative to the app data root and always use `/`.

use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

pub const LIBRARY_DIR: &str = "library";
pub const BOOK_FILE: &str = "book.pdf";
pub const COVER_FILE: &str = "cover.jpg";
const STAGING_PREFIX: &str = ".staging-";
const TRASH_PREFIX: &str = ".trash-";
const COPY_CHUNK: usize = 1024 * 1024;

pub struct Storage {
    root: PathBuf,
}

impl Storage {
    pub fn new(root: impl Into<PathBuf>) -> AppResult<Self> {
        let storage = Self { root: root.into() };
        fs::create_dir_all(storage.library_dir())?;
        Ok(storage)
    }

    pub fn library_dir(&self) -> PathBuf {
        self.root.join(LIBRARY_DIR)
    }

    /// Resolves a stored relative path (`library/<id>/book.pdf`) to an absolute one.
    pub fn resolve(&self, relative: &str) -> PathBuf {
        relative
            .split('/')
            .fold(self.root.clone(), |acc, part| acc.join(part))
    }

    pub fn book_rel(id: &str) -> String {
        format!("{LIBRARY_DIR}/{id}/{BOOK_FILE}")
    }

    pub fn cover_rel(id: &str) -> String {
        format!("{LIBRARY_DIR}/{id}/{COVER_FILE}")
    }

    pub fn book_dir(&self, id: &str) -> AppResult<PathBuf> {
        Ok(self.library_dir().join(validate_id(id)?))
    }

    pub fn staging_dir(&self, id: &str) -> AppResult<PathBuf> {
        Ok(self
            .library_dir()
            .join(format!("{STAGING_PREFIX}{}", validate_id(id)?)))
    }

    pub fn trash_dir(&self, id: &str) -> AppResult<PathBuf> {
        Ok(self
            .library_dir()
            .join(format!("{TRASH_PREFIX}{}", validate_id(id)?)))
    }

    /// Entries of the library directory, classified by name.
    pub fn scan(&self) -> AppResult<Vec<LibraryEntry>> {
        let mut entries = Vec::new();
        for entry in fs::read_dir(self.library_dir())? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            let kind = if name.starts_with(STAGING_PREFIX) || name.starts_with(TRASH_PREFIX) {
                EntryKind::Leftover
            } else if uuid::Uuid::parse_str(&name).is_ok() {
                EntryKind::Book(name)
            } else {
                continue;
            };
            entries.push(LibraryEntry {
                path: entry.path(),
                kind,
            });
        }
        Ok(entries)
    }
}

pub struct LibraryEntry {
    pub path: PathBuf,
    pub kind: EntryKind,
}

pub enum EntryKind {
    /// `library/<id>` directory.
    Book(String),
    /// Staging or trash directory left by an interrupted operation.
    Leftover,
}

/// Book ids are UUIDs; rejecting anything else prevents path traversal.
pub fn validate_id(id: &str) -> AppResult<&str> {
    uuid::Uuid::parse_str(id).map_err(|_| AppError::Invalid(format!("book id {id}")))?;
    Ok(id)
}

/// PDF files start with `%PDF-`; the spec tolerates leading junk within the first 1024 bytes.
pub fn is_pdf(path: &Path) -> AppResult<bool> {
    let mut head = Vec::with_capacity(1024);
    File::open(path)?.take(1024).read_to_end(&mut head)?;
    Ok(head.windows(5).any(|w| w == b"%PDF-"))
}

/// Streams `src` into `dst` in fixed-size chunks and fsyncs it. Never holds the whole file in memory.
pub fn copy_file(src: &Path, dst: &Path, mut on_progress: impl FnMut(u64)) -> AppResult<u64> {
    let mut reader = BufReader::with_capacity(COPY_CHUNK, File::open(src)?);
    let file = File::create(dst)?;
    let mut writer = BufWriter::with_capacity(COPY_CHUNK, file);
    let mut buf = vec![0u8; COPY_CHUNK];
    let mut copied = 0u64;
    loop {
        let read = reader.read(&mut buf)?;
        if read == 0 {
            break;
        }
        writer.write_all(&buf[..read])?;
        copied += read as u64;
        on_progress(copied);
    }
    let file = writer.into_inner().map_err(|e| e.into_error())?;
    file.sync_all()?;
    Ok(copied)
}

/// Writes a small file atomically (temp file + rename).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

/// Removes a directory tree; a missing directory is not an error.
pub fn remove_dir(path: &Path) -> AppResult<()> {
    match fs::remove_dir_all(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_pdf_header() {
        let dir = tempfile::tempdir().unwrap();
        let pdf = dir.path().join("a.pdf");
        let txt = dir.path().join("a.txt");
        fs::write(&pdf, b"%PDF-1.7\n...").unwrap();
        fs::write(&txt, b"hello").unwrap();
        assert!(is_pdf(&pdf).unwrap());
        assert!(!is_pdf(&txt).unwrap());
    }

    #[test]
    fn copies_in_chunks_with_progress() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src.pdf");
        let dst = dir.path().join("dst.pdf");
        let data = vec![7u8; COPY_CHUNK * 2 + 123];
        fs::write(&src, &data).unwrap();

        let mut calls = 0;
        let copied = copy_file(&src, &dst, |_| calls += 1).unwrap();
        assert_eq!(copied, data.len() as u64);
        assert_eq!(calls, 3);
        assert_eq!(fs::read(&dst).unwrap(), data);
    }

    #[test]
    fn rejects_non_uuid_ids() {
        let storage = Storage::new(tempfile::tempdir().unwrap().path()).unwrap();
        assert!(storage.book_dir("../etc").is_err());
        assert!(storage.book_dir(&crate::models::new_id()).is_ok());
    }

    #[test]
    fn resolves_relative_paths() {
        let dir = tempfile::tempdir().unwrap();
        let storage = Storage::new(dir.path()).unwrap();
        let path = storage.resolve(&Storage::book_rel("abc"));
        assert_eq!(
            path,
            dir.path().join("library").join("abc").join("book.pdf")
        );
    }
}
