use std::path::PathBuf;

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

use crate::db::books;
use crate::error::{AppError, AppResult};
use crate::import::ImportJob;
use crate::models::{Book, BookMetadata, EpubMetadata};
use crate::services::library;
use crate::state::AppState;

#[tauri::command]
pub fn list_books(state: State<AppState>) -> AppResult<Vec<Book>> {
    books::list_active(&state.db.conn())
}

#[tauri::command]
pub fn list_removed_books(state: State<AppState>) -> AppResult<Vec<Book>> {
    books::list_removed(&state.db.conn())
}

#[tauri::command]
pub fn get_book(state: State<AppState>, id: String) -> AppResult<Book> {
    books::get(&state.db.conn(), &id)
}

/// Queues files for import and returns immediately.
#[tauri::command]
pub fn import_books(state: State<AppState>, paths: Vec<PathBuf>) -> Vec<ImportJob> {
    state.imports.enqueue(paths)
}

#[tauri::command]
pub fn read_epub_metadata(state: State<AppState>, id: String) -> AppResult<EpubMetadata> {
    library::epub_metadata(&state.db, &state.storage, &id)
}

/// Raw-body response: the cover image bytes as stored in the EPUB.
#[tauri::command]
pub fn read_epub_cover(state: State<AppState>, id: String) -> AppResult<Response> {
    let cover = library::epub_cover(&state.db, &state.storage, &id)?
        .ok_or_else(|| AppError::NotFound(format!("cover of book {id}")))?;
    Ok(Response::new(cover))
}

/// Raw-body command: the request body is the JPEG bytes, the book id comes in a header.
#[tauri::command]
pub fn save_cover(state: State<AppState>, request: Request) -> AppResult<()> {
    let id = request
        .headers()
        .get("book-id")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Invalid("missing book-id header".into()))?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::Invalid("expected raw image bytes".into()));
    };
    library::save_cover(&state.storage, id, bytes)
}

#[tauri::command]
pub fn finalize_import(
    state: State<AppState>,
    id: String,
    metadata: BookMetadata,
) -> AppResult<Book> {
    library::finalize_import(&state.db, &state.storage, &id, &metadata)
}

#[tauri::command]
pub fn abort_import(state: State<AppState>, id: String) -> AppResult<()> {
    library::abort_import(&state.db, &state.storage, &id)
}

#[tauri::command]
pub fn remove_book(state: State<AppState>, id: String) -> AppResult<Book> {
    library::set_removed(&state.db, &id, true)
}

#[tauri::command]
pub fn restore_book(state: State<AppState>, id: String) -> AppResult<Book> {
    library::set_removed(&state.db, &id, false)
}

#[tauri::command]
pub fn delete_book(state: State<AppState>, id: String) -> AppResult<()> {
    library::delete_permanently(&state.db, &state.storage, &id)
}
