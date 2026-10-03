import type { Book, CatalogEntry } from "./types";

export type Shelf = "all" | "classics-pt" | "classics-en" | "technical";

export const shelves: { id: Shelf; label: string }[] = [
  { id: "all", label: "All" },
  { id: "classics-pt", label: "Portuguese classics" },
  { id: "classics-en", label: "English classics" },
  { id: "technical", label: "Technical" },
];

const languages: Record<string, string> = { pt: "Portuguese", en: "English" };

export function languageLabel(code: string): string {
  return languages[code] ?? code.toUpperCase();
}

function inShelf(entry: CatalogEntry, shelf: Shelf): boolean {
  switch (shelf) {
    case "all":
      return true;
    case "classics-pt":
      return entry.category === "classic" && entry.language === "pt";
    case "classics-en":
      return entry.category === "classic" && entry.language === "en";
    case "technical":
      return entry.category === "technical";
  }
}

/** Lowercase, without accents: "Eça" matches "eca". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Entries of a shelf whose title or author contains every word of the query. */
export function filterCatalog(
  entries: CatalogEntry[],
  shelf: Shelf,
  query: string,
): CatalogEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    if (!inShelf(entry, shelf)) return false;
    const haystack = fold(`${entry.title} ${entry.author}`);
    return words.every((word) => haystack.includes(word));
  });
}

export type CatalogStatus<J> =
  | { kind: "available" }
  | { kind: "importing"; job: J }
  | { kind: "inLibrary"; book: Book }
  | { kind: "removed"; book: Book };

/**
 * Where a catalog book stands: being imported, on the shelf, among removed books, or available.
 * A book whose file went missing counts as available, like the backend does.
 */
export function catalogStatus<J extends { catalogId?: string | null; stage: string }>(
  entry: CatalogEntry,
  books: Book[],
  removed: Book[],
  jobs: J[],
): CatalogStatus<J> {
  const job = jobs.find((j) => j.catalogId === entry.id && j.stage !== "failed");
  if (job) return { kind: "importing", job };
  const owned = (b: Book) => b.catalogId === entry.id && b.status !== "missing";
  const book = books.find(owned);
  if (book) return { kind: "inLibrary", book };
  const gone = removed.find(owned);
  if (gone) return { kind: "removed", book: gone };
  return { kind: "available" };
}
