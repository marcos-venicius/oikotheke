//! Reading positions. A location is opaque text interpreted by the book's format:
//! - PDF: a page number (`"42"`), within `1..=page_count` once the page count is known
//! - EPUB: an EPUB CFI (`"epubcfi(/6/14!/4/2/1:0)"`)

use crate::error::{AppError, AppResult};
use crate::models::{Book, BookFormat};

/// CFIs grow with document depth; this is far beyond any real one.
const MAX_CFI_LEN: usize = 4096;

/// Checks that `location` is valid for `book` and returns its canonical form.
pub fn validate(book: &Book, location: &str) -> AppResult<String> {
    let location = location.trim();
    let invalid = || AppError::Invalid(format!("location {location:?}"));
    match book.format {
        BookFormat::Pdf => {
            let page: i64 = location.parse().map_err(|_| invalid())?;
            if page < 1 || (book.page_count > 0 && page > book.page_count) {
                return Err(invalid());
            }
            Ok(page.to_string())
        }
        BookFormat::Epub => {
            let well_formed = location.starts_with("epubcfi(") && location.ends_with(')');
            if !well_formed || location.len() > MAX_CFI_LEN {
                return Err(invalid());
            }
            Ok(location.to_owned())
        }
    }
}

/// Progress must be a number in [0, 1].
pub fn validate_progress(progress: f64) -> AppResult<f64> {
    if !(0.0..=1.0).contains(&progress) {
        return Err(AppError::Invalid(format!("progress {progress}")));
    }
    Ok(progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::BookStatus;

    fn book(format: BookFormat, page_count: i64) -> Book {
        Book {
            id: "b".into(),
            format,
            title: "t".into(),
            author: None,
            file_path: "p".into(),
            cover_path: None,
            page_count,
            location: None,
            progress: 0.0,
            zoom_level: None,
            zoom_mode: None,
            file_size: 1,
            status: BookStatus::Ready,
            removed_at: None,
            created_at: 0,
            updated_at: 0,
            note_count: 0,
        }
    }

    #[test]
    fn pdf_locations_are_pages_in_range() {
        let pdf = book(BookFormat::Pdf, 10);
        assert_eq!(validate(&pdf, " 7 ").unwrap(), "7");
        assert_eq!(validate(&pdf, "10").unwrap(), "10");
        for bad in ["0", "11", "-1", "", "2.5", "epubcfi(/6/2)"] {
            assert!(validate(&pdf, bad).is_err(), "{bad:?}");
        }
        // Unknown page count (still importing): any positive page.
        assert!(validate(&book(BookFormat::Pdf, 0), "500").is_ok());
    }

    #[test]
    fn epub_locations_are_cfis() {
        let epub = book(BookFormat::Epub, 0);
        let cfi = "epubcfi(/6/14!/4/2/1:0)";
        assert_eq!(validate(&epub, cfi).unwrap(), cfi);
        assert!(validate(&epub, "42").is_err());
        assert!(validate(&epub, "epubcfi(/6/14").is_err());
        let huge = format!("epubcfi({})", "/2".repeat(MAX_CFI_LEN));
        assert!(validate(&epub, &huge).is_err());
    }

    #[test]
    fn progress_is_a_fraction() {
        assert_eq!(validate_progress(0.25).unwrap(), 0.25);
        for bad in [-0.1, 1.1, f64::NAN, f64::INFINITY] {
            assert!(validate_progress(bad).is_err(), "{bad}");
        }
    }
}
