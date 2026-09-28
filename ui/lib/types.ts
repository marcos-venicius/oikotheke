export type BookStatus = "importing" | "ready" | "missing";

export type ZoomMode = "fit-page" | "fit-width" | "custom";

export interface Book {
  id: string;
  title: string;
  author: string | null;
  filePath: string;
  coverPath: string | null;
  pageCount: number;
  currentPage: number;
  zoomLevel: number | null;
  zoomMode: ZoomMode | null;
  fileSize: number;
  status: BookStatus;
  removedAt: number | null;
  createdAt: number;
  updatedAt: number;
  noteCount: number;
}

export interface Note {
  id: string;
  bookId: string;
  pageNumber: number;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface BookMetadata {
  title: string;
  author: string | null;
  pageCount: number;
}

export interface ImportJob {
  jobId: string;
  fileName: string;
  totalBytes: number;
}

export type ThemePreference = "light" | "dark" | "system";

export interface ReadingProgress {
  currentPage: number;
  zoomLevel: number | null;
  zoomMode: ZoomMode;
}
