import type { Book } from "./types";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** Reading progress in [0, 1]; page 1 counts as not started. */
export function readingProgress(book: Pick<Book, "currentPage" | "pageCount">): number {
  if (book.pageCount <= 1 || book.currentPage <= 1) return 0;
  return Math.min(1, book.currentPage / book.pageCount);
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
