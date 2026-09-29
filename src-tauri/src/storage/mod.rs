//! Managed file storage: `<app-data>/library/<book-id>/{book.pdf|book.epub, cover.jpg}`.
//!
//! Paths persisted in the database are relative to the app data root and always use `/`.

use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::epub;
use crate::error::{AppError, AppResult};
use crate::models::BookFormat;

pub const LIBRARY_DIR: &str = "library";
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

    /// Resolves a stored relative path (`library/<id>/book.epub`) to an absolute one.
    pub fn resolve(&self, relative: &str) -> PathBuf {
        relative
            .split('/')
            .fold(self.root.clone(), |acc, part| acc.join(part))
    }

    pub fn book_rel(id: &str, format: BookFormat) -> String {
        format!("{LIBRARY_DIR}/{id}/{}", book_file(format))
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

/// Name of the managed copy inside a book directory.
pub fn book_file(format: BookFormat) -> &'static str {
    match format {
        BookFormat::Pdf => "book.pdf",
        BookFormat::Epub => "book.epub",
    }
}

/// Identifies a supported book by its content, never by its extension.
pub fn detect_format(path: &Path) -> AppResult<Option<BookFormat>> {
    if is_pdf(path)? {
        return Ok(Some(BookFormat::Pdf));
    }
    if epub::is_epub(path)? {
        return Ok(Some(BookFormat::Epub));
    }
    Ok(None)
}

/// PDF files start with `%PDF-`; the spec tolerates leading junk within the first 1024 bytes.
fn is_pdf(path: &Path) -> AppResult<bool> {
    let mut head = Vec::with_capacity(1024);
    File::open(path)?.take(1024).read_to_end(&mut head)?;
    Ok(head.windows(5).any(|w| w == b"%PDF-"))
}

pub struct Copied {
    pub size: u64,
    /// SHA-256 of the content, hex-encoded; identifies the same book under any file name.
    pub sha256: String,
}

/// Streams `src` into `dst` in fixed-size chunks, hashing on the way, and fsyncs it. Never
/// holds the whole file in memory.
pub fn copy_file(src: &Path, dst: &Path, mut on_progress: impl FnMut(u64)) -> AppResult<Copied> {
    let mut reader = BufReader::with_capacity(COPY_CHUNK, File::open(src)?);
    let file = File::create(dst)?;
    let mut writer = BufWriter::with_capacity(COPY_CHUNK, file);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; COPY_CHUNK];
    let mut copied = 0u64;
    loop {
        let read = reader.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
        writer.write_all(&buf[..read])?;
        copied += read as u64;
        on_progress(copied);
    }
    let file = writer.into_inner().map_err(|e| e.into_error())?;
    file.sync_all()?;
    Ok(Copied {
        size: copied,
        sha256: hex(&hasher.finalize()),
    })
}

/// SHA-256 of a file, read in chunks.
pub fn hash_file(path: &Path) -> AppResult<String> {
    let mut reader = BufReader::with_capacity(COPY_CHUNK, File::open(path)?);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; COPY_CHUNK];
    loop {
        let read = reader.read(&mut buf)?;
        if read == 0 {
            break;
        }
        hasher.update(&buf[..read]);
    }
    Ok(hex(&hasher.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
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
    fn detects_formats_by_content() {
        let dir = tempfile::tempdir().unwrap();
        // Extensions are deliberately misleading.
        let pdf = dir.path().join("a.epub");
        let txt = dir.path().join("a.pdf");
        fs::write(&pdf, b"%PDF-1.7\n...").unwrap();
        fs::write(&txt, b"hello").unwrap();
        let epub = epub::tests::write_epub(dir.path(), "b.pdf", &epub::tests::opf("", ""), &[]);
        assert_eq!(detect_format(&pdf).unwrap(), Some(BookFormat::Pdf));
        assert_eq!(detect_format(&epub).unwrap(), Some(BookFormat::Epub));
        assert_eq!(detect_format(&txt).unwrap(), None);
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
        assert_eq!(copied.size, data.len() as u64);
        assert_eq!(calls, 3);
        assert_eq!(fs::read(&dst).unwrap(), data);
        assert_eq!(copied.sha256, hash_file(&src).unwrap());
    }

    #[test]
    fn hashes_content() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a");
        fs::write(&path, b"abc").unwrap();
        assert_eq!(
            hash_file(&path).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
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
        let path = storage.resolve(&Storage::book_rel("abc", BookFormat::Pdf));
        assert_eq!(
            path,
            dir.path().join("library").join("abc").join("book.pdf")
        );
    }
}
