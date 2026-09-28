import { describe, expect, it } from "vitest";
import type { Note } from "./types";
import { groupNotes, isWithin, noteLabel, rangeStart, sortNotes } from "./notes";

let created = 0;
const note = (location: string, label: string | null = null): Note => ({
  id: `${location}-${created}`,
  bookId: "b",
  location,
  label,
  content: location,
  createdAt: created++,
  updatedAt: 0,
});

describe("PDF notes", () => {
  const notes = [note("12"), note("3"), note("12"), note("100")];

  it("sort by page, then creation", () => {
    expect(sortNotes("pdf", notes).map((n) => n.location)).toEqual(["3", "12", "12", "100"]);
  });

  it("group by page", () => {
    const groups = groupNotes("pdf", notes);
    expect(groups.map((g) => [g.label, g.notes.length])).toEqual([
      ["Page 3", 1],
      ["Page 12", 2],
      ["Page 100", 1],
    ]);
    expect(groups[1].location).toBe("12");
  });
});

describe("EPUB notes", () => {
  const ch1a = note("epubcfi(/6/4!/4/2/1:0)", "Chapter 1");
  const ch1b = note("epubcfi(/6/4!/4/10/1:5)", "Chapter 1");
  const ch2 = note("epubcfi(/6/6!/4/2/1:0)", "Chapter 2");
  const untitled = note("epubcfi(/6/10!/4/2/1:0)");

  it("sort in reading order, not by string", () => {
    expect(sortNotes("epub", [ch2, untitled, ch1b, ch1a])).toEqual([ch1a, ch1b, ch2, untitled]);
  });

  it("group by chapter", () => {
    expect(groupNotes("epub", [ch2, ch1b, ch1a]).map((g) => [g.label, g.notes.length])).toEqual([
      ["Chapter 1", 2],
      ["Chapter 2", 1],
    ]);
    expect(noteLabel("epub", untitled)).toBe("Untitled section");
  });

  it("find notes inside the visible range", () => {
    const visible = "epubcfi(/6/4!/4,/2/1:0,/8/1:20)";
    expect(rangeStart(visible)).toBe("epubcfi(/6/4!/4/2/1:0)");
    expect(isWithin(ch1a.location, visible)).toBe(true);
    expect(isWithin(ch1b.location, visible)).toBe(false);
    expect(isWithin(ch2.location, visible)).toBe(false);
    expect(isWithin("not a cfi", visible)).toBe(false);
  });
});
