import type { Note } from "@/lib/types";

/** Sorted, unique page numbers that have at least one note. */
export function notedPages(notes: Note[]): number[] {
  return [...new Set(notes.map((n) => n.pageNumber))].sort((a, b) => a - b);
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
  for (const note of notes) {
    const list = groups.get(note.pageNumber) ?? [];
    list.push(note);
    groups.set(note.pageNumber, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([page, list]) => ({ page, notes: list }));
}
