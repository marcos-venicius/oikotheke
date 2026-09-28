use tauri::State;

use crate::error::AppResult;
use crate::models::Note;
use crate::services::notes;
use crate::state::AppState;

#[tauri::command]
pub fn list_notes(state: State<AppState>, book_id: String) -> AppResult<Vec<Note>> {
    notes::list(&state.db, &book_id)
}

#[tauri::command]
pub fn create_note(
    state: State<AppState>,
    book_id: String,
    page_number: i64,
    content: String,
) -> AppResult<Note> {
    notes::create(&state.db, &book_id, page_number, &content)
}

#[tauri::command]
pub fn update_note(state: State<AppState>, id: String, content: String) -> AppResult<Note> {
    notes::update(&state.db, &id, &content)
}

#[tauri::command]
pub fn delete_note(state: State<AppState>, id: String) -> AppResult<()> {
    notes::delete(&state.db, &id)
}
