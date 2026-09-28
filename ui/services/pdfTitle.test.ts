import { describe, expect, it } from "vitest";
import { pickAuthor, pickTitle } from "./pdfTitle";

describe("pickTitle", () => {
  it("uses a meaningful embedded title", () => {
    expect(pickTitle("  Clean Code ", "file")).toBe("Clean Code");
    expect(pickTitle("regression\u0000", "file")).toBe("regression");
    expect(pickTitle("Clean\u0000\u0000Code", "file")).toBe("Clean Code");
  });

  it("falls back for missing or generated titles", () => {
    expect(pickTitle(undefined, "file")).toBe("file");
    expect(pickTitle("", "file")).toBe("file");
    expect(pickTitle("Microsoft Word - draft.docx", "file")).toBe("file");
    expect(pickTitle("chapter1.tex", "file")).toBe("file");
    expect(pickTitle("Untitled", "file")).toBe("file");
    expect(pickTitle("0001", "file")).toBe("file");
    expect(pickTitle("\u0000", "file")).toBe("file");
  });
});

describe("pickAuthor", () => {
  it("drops empty and placeholder authors", () => {
    expect(pickAuthor("Robert C. Martin")).toBe("Robert C. Martin");
    expect(pickAuthor(" ")).toBeNull();
    expect(pickAuthor("\u0000")).toBeNull();
    expect(pickAuthor("Unknown")).toBeNull();
    expect(pickAuthor(42)).toBeNull();
  });
});
