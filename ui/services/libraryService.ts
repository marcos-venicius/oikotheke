import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Book, BookMetadata, CatalogEntry, ImportJob } from "@/lib/types";
import { call, type AppError } from "./ipc";

export interface ImportProgressEvent {
  jobId: string;
  copiedBytes: number;
  totalBytes: number;
}

export interface ImportCopiedEvent {
  jobId: string;
  book: Book;
}

export interface ImportFailedEvent {
  jobId: string;
  error: AppError;
}

export const libraryService = {
  listBooks: () => call<Book[]>("list_books"),
  listRemovedBooks: () => call<Book[]>("list_removed_books"),
  getBook: (id: string) => call<Book>("get_book", { id }),

  /** Queues files for a background copy; returns immediately. */
  importFiles: (paths: string[]) => call<ImportJob[]>("import_books", { paths }),
  /** The Discover catalog (bundled; no network). */
  listCatalog: () => call<CatalogEntry[]>("list_catalog"),
  /** Queues the download and import of a Discover book; returns immediately. */
  importFromCatalog: (id: string) => call<ImportJob>("import_from_catalog", { id }),
  saveCover: (id: string, bytes: Uint8Array) =>
    call<void>("save_cover", bytes, { headers: { "book-id": id } }),
  finalizeImport: (id: string, metadata: BookMetadata) =>
    call<Book>("finalize_import", { id, metadata }),
  abortImport: (id: string) => call<void>("abort_import", { id }),

  removeBook: (id: string) => call<Book>("remove_book", { id }),
  restoreBook: (id: string) => call<Book>("restore_book", { id }),
  deleteBook: (id: string) => call<void>("delete_book", { id }),

  onImportProgress: (cb: (e: ImportProgressEvent) => void): Promise<UnlistenFn> =>
    listen<ImportProgressEvent>("import:progress", (e) => cb(e.payload)),
  onImportCopied: (cb: (e: ImportCopiedEvent) => void): Promise<UnlistenFn> =>
    listen<ImportCopiedEvent>("import:copied", (e) => cb(e.payload)),
  onImportFailed: (cb: (e: ImportFailedEvent) => void): Promise<UnlistenFn> =>
    listen<ImportFailedEvent>("import:failed", (e) => cb(e.payload)),
};
