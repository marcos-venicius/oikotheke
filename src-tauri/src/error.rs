use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("The file is not a PDF or EPUB")]
    UnsupportedFormat,
    #[error("The book is damaged or can't be read ({0})")]
    Unreadable(String),
    #[error("The book is protected by DRM")]
    Drm,
    #[error(
        "\u{201c}{title}\u{201d} is already in your library{}",
        if *.removed { " (among removed books; restore it from there)" } else { "" }
    )]
    Duplicate { title: String, removed: bool },
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    #[error("Not enough disk space")]
    DiskFull,
    #[error("Invalid input: {0}")]
    Invalid(String),
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("I/O error: {0}")]
    Io(std::io::Error),
}

impl AppError {
    pub fn kind(&self) -> &'static str {
        match self {
            AppError::NotFound(_) => "notFound",
            AppError::UnsupportedFormat => "unsupportedFormat",
            AppError::Unreadable(_) => "unreadable",
            AppError::Drm => "drm",
            AppError::Duplicate { .. } => "duplicate",
            AppError::PermissionDenied(_) => "permissionDenied",
            AppError::DiskFull => "diskFull",
            AppError::Invalid(_) => "invalid",
            AppError::Db(_) => "database",
            AppError::Io(_) => "io",
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        use std::io::ErrorKind;
        match err.kind() {
            ErrorKind::PermissionDenied => AppError::PermissionDenied(err.to_string()),
            ErrorKind::StorageFull => AppError::DiskFull,
            ErrorKind::NotFound => AppError::NotFound(err.to_string()),
            _ => AppError::Io(err),
        }
    }
}

/// Serialized as `{ kind, message }` so the UI can react to specific failures.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Error, ErrorKind};

    #[test]
    fn maps_io_errors_to_kinds() {
        assert_eq!(
            AppError::from(Error::from(ErrorKind::StorageFull)).kind(),
            "diskFull"
        );
        assert_eq!(
            AppError::from(Error::from(ErrorKind::PermissionDenied)).kind(),
            "permissionDenied"
        );
        assert_eq!(
            AppError::from(Error::from(ErrorKind::NotFound)).kind(),
            "notFound"
        );
        assert_eq!(AppError::from(Error::from(ErrorKind::Other)).kind(), "io");
    }

    #[test]
    fn serializes_kind_and_message() {
        let json = serde_json::to_value(AppError::UnsupportedFormat).unwrap();
        assert_eq!(json["kind"], "unsupportedFormat");
        assert_eq!(json["message"], "The file is not a PDF or EPUB");
    }
}
