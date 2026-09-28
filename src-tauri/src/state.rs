use crate::db::Database;
use crate::import::ImportQueue;
use crate::storage::Storage;

pub struct AppState {
    pub db: Database,
    pub storage: Storage,
    pub imports: ImportQueue,
}
