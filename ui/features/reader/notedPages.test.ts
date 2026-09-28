import { describe, expect, it } from "vitest";
import type { Note } from "@/lib/types";
import { adjacentNotedPage, groupByPage, notedPages } from "./notedPages";

const note = (id: string, page: number | string): Note => ({
  id,
  bookId: "b",
  location: String(page),
  label: null,
  content: id,
  createdAt: 0,
  updatedAt: 0,
});

describe("notedPages", () => {
  const notes = [note("a", 12), note("b", 3), note("c", 12), note("d", 40)];

  it("lists unique sorted pages", () => {
    expect(notedPages(notes)).toEqual([3, 12, 40]);
  });

  it("finds adjacent annotated pages", () => {
    const pages = notedPages(notes);
    expect(adjacentNotedPage(pages, 12, 1)).toBe(40);
    expect(adjacentNotedPage(pages, 12, -1)).toBe(3);
    expect(adjacentNotedPage(pages, 5, 1)).toBe(12);
    expect(adjacentNotedPage(pages, 40, 1)).toBeNull();
    expect(adjacentNotedPage(pages, 3, -1)).toBeNull();
  });

  it("skips notes without a valid page", () => {
    expect(notedPages([...notes, note("x", "epubcfi(/6/2)")])).toEqual([3, 12, 40]);
  });

  it("groups notes by page", () => {
    expect(groupByPage(notes).map((g) => [g.page, g.notes.map((n) => n.id)])).toEqual([
      [3, ["b"]],
      [12, ["a", "c"]],
      [40, ["d"]],
    ]);
  });
});
