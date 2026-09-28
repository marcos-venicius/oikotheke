import type { Note } from "@/lib/types";
import { pdfPage } from "@/lib/location";

/** Notes with the PDF page they belong to; notes without a valid page are skipped. */
function withPages(notes: Note[]): Array<[number, Note]> {
  return notes.flatMap((note) => {
    const page = pdfPage(note.location);
    return page === null ? [] : [[page, note] as [number, Note]];
  });
}

/** Sorted, unique page numbers that have at least one note. */
export function notedPages(notes: Note[]): number[] {
  return [...new Set(withPages(notes).map(([page]) => page))].sort((a, b) => a - b);
}

/** Closest annotated page before or after `current`, or null. */
export function adjacentNotedPage(
  pages: number[],
  current: number,
  direction: 1 | -1,
): number | null {
  if (direction > 0) return pages.find((p) => p > current) ?? null;
  for (let i = pages.length - 1; i >= 0; i--) if (pages[i] < current) return pages[i];
  return null;
}

/** Notes grouped by page, in page order. */
export function groupByPage(notes: Note[]): Array<{ page: number; notes: Note[] }> {
  const groups = new Map<number, Note[]>();
  for (const [page, note] of withPages(notes)) {
    const list = groups.get(page) ?? [];
    list.push(note);
    groups.set(page, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([page, list]) => ({ page, notes: list }));
}
