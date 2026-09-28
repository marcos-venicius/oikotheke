use tauri::State;

use crate::db::books;
use crate::error::AppResult;
use crate::models::ReadingProgress;
use crate::state::AppState;

#[tauri::command]
pub fn save_progress(
    state: State<AppState>,
    id: String,
    progress: ReadingProgress,
) -> AppResult<()> {
    books::update_progress(&state.db.conn(), &id, &progress)
}
