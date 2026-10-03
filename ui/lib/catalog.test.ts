import { describe, expect, it } from "vitest";
import { catalogStatus, filterCatalog } from "./catalog";
import type { Book, CatalogEntry } from "./types";

const entry = (id: string, patch: Partial<CatalogEntry>): CatalogEntry => ({
  id,
  title: id,
  author: "",
  year: 1900,
  language: "en",
  category: "classic",
  format: "epub",
  source: "",
  license: "",
  description: "",
  ...patch,
});

const catalog = [
  entry("os-maias", { title: "Os Maias", author: "Eça de Queirós", language: "pt" }),
  entry("dom-casmurro", { title: "Dom Casmurro", author: "Machado de Assis", language: "pt" }),
  entry("frankenstein", { title: "Frankenstein", author: "Mary Shelley" }),
  entry("pro-git", { title: "Pro Git", author: "Scott Chacon", category: "technical" }),
];

const ids = (entries: CatalogEntry[]) => entries.map((e) => e.id);

describe("filterCatalog", () => {
  it("filters by shelf", () => {
    expect(ids(filterCatalog(catalog, "all", ""))).toEqual(ids(catalog));
    expect(ids(filterCatalog(catalog, "classics-pt", ""))).toEqual(["os-maias", "dom-casmurro"]);
    expect(ids(filterCatalog(catalog, "classics-en", ""))).toEqual(["frankenstein"]);
    expect(ids(filterCatalog(catalog, "technical", ""))).toEqual(["pro-git"]);
  });

  it("searches title and author, ignoring case and accents", () => {
    expect(ids(filterCatalog(catalog, "all", "eca"))).toEqual(["os-maias"]);
    expect(ids(filterCatalog(catalog, "all", "  MACHADO  casmurro "))).toEqual(["dom-casmurro"]);
    expect(ids(filterCatalog(catalog, "technical", "shelley"))).toEqual([]);
  });
});

describe("catalogStatus", () => {
  const book = (patch: Partial<Book>) =>
    ({ id: "b", catalogId: "pro-git", status: "ready", ...patch }) as Book;
  const git = catalog[3];

  it("is available when nothing refers to it", () => {
    expect(catalogStatus(git, [book({ catalogId: null })], [], [])).toEqual({
      kind: "available",
    });
  });

  it("prefers a running import, then the shelf, then removed books", () => {
    const job = { catalogId: "pro-git", stage: "copying" };
    const onShelf = book({});
    expect(catalogStatus(git, [onShelf], [], [job])).toEqual({ kind: "importing", job });
    expect(catalogStatus(git, [onShelf], [], [{ ...job, stage: "failed" }])).toEqual({
      kind: "inLibrary",
      book: onShelf,
    });
    const removed = book({ removedAt: 1 });
    expect(catalogStatus(git, [], [removed], [])).toEqual({ kind: "removed", book: removed });
  });

  it("offers a book again when its file went missing", () => {
    expect(catalogStatus(git, [book({ status: "missing" })], [], [])).toEqual({
      kind: "available",
    });
  });
});
