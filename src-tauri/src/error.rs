use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("The file is not a valid PDF")]
    NotPdf,
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
            AppError::NotPdf => "notPdf",
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
