const JUNK_TITLE = [
  /^untitled$/i,
  /^microsoft (word|powerpoint) - /i,
  /\.(docx?|pptx?|odt|rtf|txt|pdf|indd|tex|dvi)$/i,
  /^[\s\d_-]*$/,
];

/** Drops control characters (some generators end strings with NUL) and collapses whitespace. */
function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\p{Cc}\s]+/gu, " ").trim();
}

/** Picks the embedded PDF title unless it's missing or obviously generated. */
export function pickTitle(embedded: unknown, fallback: string): string {
  const title = clean(embedded);
  if (!title || JUNK_TITLE.some((re) => re.test(title))) return fallback;
  return title;
}

export function pickAuthor(embedded: unknown): string | null {
  const author = clean(embedded);
  return author && !/^(unknown|user|admin)$/i.test(author) ? author : null;
}
