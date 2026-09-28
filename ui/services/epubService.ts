import type { EpubMetadata } from "@/lib/types";
import { call } from "./ipc";

/** EPUB package reading happens in the backend; the UI only turns the cover into a thumbnail. */
export const epubService = {
  readMetadata: (bookId: string) => call<EpubMetadata>("read_epub_metadata", { id: bookId }),
  /** The cover image exactly as stored in the book (JPEG, PNG, …). */
  readCover: (bookId: string) => call<ArrayBuffer>("read_epub_cover", { id: bookId }),
};
