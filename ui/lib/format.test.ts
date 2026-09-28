import { describe, expect, it } from "vitest";
import { formatBytes, plural, readingProgress } from "./format";

describe("format", () => {
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });

  it("computes reading progress", () => {
    expect(readingProgress({ currentPage: 1, pageCount: 100 })).toBe(0);
    expect(readingProgress({ currentPage: 50, pageCount: 100 })).toBe(0.5);
    expect(readingProgress({ currentPage: 100, pageCount: 100 })).toBe(1);
    expect(readingProgress({ currentPage: 3, pageCount: 0 })).toBe(0);
  });

  it("pluralizes", () => {
    expect(plural(1, "note")).toBe("1 note");
    expect(plural(2, "note")).toBe("2 notes");
  });
});
