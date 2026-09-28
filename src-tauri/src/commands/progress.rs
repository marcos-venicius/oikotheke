use tauri::State;

use crate::error::AppResult;
use crate::models::ReadingProgress;
use crate::services::progress;
use crate::state::AppState;

#[tauri::command]
pub fn save_progress(
    state: State<AppState>,
    id: String,
    progress: ReadingProgress,
) -> AppResult<()> {
    progress::save(&state.db, &id, &progress)
}
