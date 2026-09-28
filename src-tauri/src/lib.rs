mod commands;
mod db;
mod error;
mod import;
mod models;
mod protocol;
mod services;
mod state;
mod storage;

use tauri::Manager;

use crate::db::Database;
use crate::import::ImportQueue;
use crate::state::AppState;
use crate::storage::Storage;

const DATABASE_FILE: &str = "pdf-shelf.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let storage = Storage::new(&data_dir)?;
            let db = Database::open(&data_dir.join(DATABASE_FILE))?;
            match services::reconcile::reconcile(&db, &storage) {
                Ok(report) => log::info!("reconcile: {report:?}"),
                Err(err) => log::error!("reconcile failed: {err}"),
            }
            let imports = ImportQueue::start(app.handle().clone());
            app.manage(AppState {
                db,
                storage,
                imports,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::list_books,
            commands::library::list_removed_books,
            commands::library::get_book,
            commands::library::import_books,
            commands::library::save_cover,
            commands::library::finalize_import,
            commands::library::abort_import,
            commands::library::remove_book,
            commands::library::restore_book,
            commands::library::delete_book,
            commands::settings::get_settings,
            commands::settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
