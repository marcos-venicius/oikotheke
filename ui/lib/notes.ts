import { collapse, compare } from "foliate-js/epubcfi.js";
import type { BookFormat, Note } from "./types";
import { pdfPage } from "./location";

/** Notes that sit at the same place, shown together (a PDF page, an EPUB chapter). */
export interface NoteGroup {
  key: string;
  label: string;
  /** Where the reader opens for this group: its first note. */
  location: string;
  notes: Note[];
}

/** Reading-order comparison of two locations of the same format. */
export function compareLocations(format: BookFormat, a: string, b: string): number {
  if (format === "pdf") return (pdfPage(a) ?? 0) - (pdfPage(b) ?? 0);
  try {
    return compare(a, b);
  } catch {
    return a.localeCompare(b);
  }
}

/** Notes in reading order; notes at the same place keep their creation order. */
export function sortNotes(format: BookFormat, notes: Note[]): Note[] {
  return [...notes].sort(
    (a, b) => compareLocations(format, a.location, b.location) || a.createdAt - b.createdAt,
  );
}

/** What a note's place is called: "Page 42", or the chapter captured when it was written. */
export function noteLabel(format: BookFormat, note: Note): string {
  if (format === "pdf") return `Page ${pdfPage(note.location) ?? "?"}`;
  return note.label ?? "Untitled section";
}

/** Notes in reading order, grouped by page (PDF) or by consecutive chapter (EPUB). */
export function groupNotes(format: BookFormat, notes: Note[]): NoteGroup[] {
  const groups: NoteGroup[] = [];
  for (const note of sortNotes(format, notes)) {
    const label = noteLabel(format, note);
    const last = groups.at(-1);
    if (last && last.label === label) last.notes.push(note);
    else groups.push({ key: note.location, label, location: note.location, notes: [note] });
  }
  return groups;
}

/** True when an EPUB point CFI falls inside the visible range CFI. */
export function isWithin(point: string, range: string): boolean {
  try {
    return compare(point, collapse(range)) >= 0 && compare(point, collapse(range, true)) <= 0;
  } catch {
    return false;
  }
}

/** The point where a visible range CFI starts, used as the location of a new EPUB note. */
export function rangeStart(range: string): string {
  return collapse(range);
}
