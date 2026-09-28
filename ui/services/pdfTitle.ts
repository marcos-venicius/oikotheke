const JUNK_TITLE = [
  /^untitled$/i,
  /^microsoft (word|powerpoint) - /i,
  /\.(docx?|pptx?|odt|rtf|txt|pdf|indd|tex|dvi)$/i,
  /^[\s\d_-]*$/,
];

/** Picks the embedded PDF title unless it's missing or obviously generated. */
export function pickTitle(embedded: unknown, fallback: string): string {
  const title = typeof embedded === "string" ? embedded.trim() : "";
  if (!title || JUNK_TITLE.some((re) => re.test(title))) return fallback;
  return title;
}

export function pickAuthor(embedded: unknown): string | null {
  const author = typeof embedded === "string" ? embedded.trim() : "";
  return author && !/^(unknown|user|admin)$/i.test(author) ? author : null;
}
