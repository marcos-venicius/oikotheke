/**
 * Reading positions are opaque strings interpreted by the book's format (see CLAUDE.md). PDF
 * locations are page numbers as text ("42"); these helpers convert to and from pages.
 */

/** The page a PDF location points to, or null when it isn't a valid page. */
export function pdfPage(location: string | null | undefined): number | null {
  if (!location || !/^\d+$/.test(location)) return null;
  const page = Number(location);
  return page >= 1 ? page : null;
}

export function pdfLocation(page: number): string {
  return String(page);
}

/** Reading progress in [0, 1] at `page`; page 1 counts as not started. */
export function pdfProgress(page: number, pageCount: number): number {
  if (pageCount <= 1 || page <= 1) return 0;
  return Math.min(1, page / pageCount);
}
