use std::collections::HashMap;

use tauri::State;

use crate::db::settings;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> AppResult<HashMap<String, String>> {
    settings::all(&state.db.conn())
}

#[tauri::command]
pub fn set_setting(state: State<AppState>, key: String, value: String) -> AppResult<()> {
    settings::set(&state.db.conn(), &key, &value)
}
