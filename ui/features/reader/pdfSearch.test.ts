import { describe, expect, it } from "vitest";
import { findMatches, foldText, indexPage } from "./pdfSearch";

describe("foldText", () => {
  it("ignores case, accents and extra whitespace", () => {
    expect(foldText("  Ação\tÉPICA  ")).toBe("acao epica");
  });

  it("expands ligatures", () => {
    expect(foldText("ﬁm")).toBe("fim");
  });
});

describe("indexPage + findMatches", () => {
  it("finds accent- and case-insensitive matches inside an item", () => {
    const page = indexPage([{ str: "A Ação e a ação." }]);
    const matches = findMatches(page, foldText("acao"));
    expect(matches).toEqual([
      { start: { item: 0, offset: 2 }, end: { item: 0, offset: 6 } },
      { start: { item: 0, offset: 11 }, end: { item: 0, offset: 15 } },
    ]);
  });

  it("matches across items joined without a separator", () => {
    const page = indexPage([{ str: "Hel" }, { str: "lo world" }]);
    expect(findMatches(page, "hello")).toEqual([
      { start: { item: 0, offset: 0 }, end: { item: 1, offset: 2 } },
    ]);
  });

  it("treats a line end as a space", () => {
    const page = indexPage([{ str: "end of the", hasEOL: true }, { str: "line" }]);
    expect(page.text).toBe("end of the line");
    expect(findMatches(page, "the line")).toEqual([
      { start: { item: 0, offset: 7 }, end: { item: 1, offset: 4 } },
    ]);
  });

  it("collapses runs of whitespace, also across items", () => {
    const page = indexPage([{ str: "two  " }, { str: " ", hasEOL: true }, { str: " words" }]);
    expect(page.text).toBe("two words");
    expect(findMatches(page, "two words")).toHaveLength(1);
  });

  it("keeps a combining accent inside the match", () => {
    // "é" written as e + combining accent: two code units, one folded character.
    const page = indexPage([{ str: "cafe\u0301!" }]);
    expect(findMatches(page, "cafe")).toEqual([
      { start: { item: 0, offset: 0 }, end: { item: 0, offset: 5 } },
    ]);
  });

  it("returns nothing for an empty query", () => {
    expect(findMatches(indexPage([{ str: "text" }]), "")).toEqual([]);
  });
});
