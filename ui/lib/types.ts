export type BookStatus = "importing" | "ready" | "missing";

export type BookFormat = "pdf" | "epub";

export type ZoomMode = "fit-page" | "fit-width" | "fit-height" | "custom";

export interface Book {
  id: string;
  format: BookFormat;
  title: string;
  author: string | null;
  filePath: string;
  coverPath: string | null;
  /** PDF only; 0 when unknown. */
  pageCount: number;
  /** Last reading position (see `lib/location`); null = start of the book. */
  location: string | null;
  /** Reading progress in [0, 1]. */
  progress: number;
  zoomLevel: number | null;
  zoomMode: ZoomMode | null;
  fileSize: number;
  status: BookStatus;
  removedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** The Discover catalog entry the book was downloaded from; null for the user's own files. */
  catalogId: string | null;
  noteCount: number;
}

export interface Note {
  id: string;
  bookId: string;
  location: string;
  /** Display text captured at creation (e.g. a chapter title); null for PDF. */
  label: string | null;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface BookMetadata {
  title: string;
  author: string | null;
  pageCount: number;
}

export interface EpubMetadata {
  title: string | null;
  author: string | null;
  hasCover: boolean;
}

export interface ImportJob {
  jobId: string;
  fileName: string;
  /** 0 when unknown (a download whose size is not known yet). */
  totalBytes: number;
  /** Set when the job downloads a Discover book. */
  catalogId: string | null;
}

/** A freely licensed book listed in Discover, bundled with the app. */
export interface CatalogEntry {
  id: string;
  title: string;
  author: string;
  year: number;
  /** ISO 639-1 code. */
  language: string;
  category: "classic" | "technical";
  format: BookFormat;
  /** Where the file is downloaded from, e.g. "Project Gutenberg". */
  source: string;
  license: string;
  description: string;
}

export type ThemePreference = "light" | "dark" | "system";

export interface ReadingProgress {
  location: string;
  progress: number;
  /** PDF view settings; null for EPUB. */
  zoomLevel: number | null;
  zoomMode: ZoomMode | null;
}
