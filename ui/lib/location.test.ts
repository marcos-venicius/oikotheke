import { describe, expect, it } from "vitest";
import { describePosition, pdfLocation, pdfPage, pdfProgress } from "./location";

describe("pdf locations", () => {
  it("round-trips pages", () => {
    expect(pdfLocation(42)).toBe("42");
    expect(pdfPage(pdfLocation(42))).toBe(42);
  });

  it("rejects anything that isn't a page", () => {
    for (const bad of [null, undefined, "", "0", "-3", "2.5", " 7", "epubcfi(/6/2)"]) {
      expect(pdfPage(bad)).toBeNull();
    }
  });

  it("computes reading progress", () => {
    expect(pdfProgress(1, 100)).toBe(0);
    expect(pdfProgress(50, 100)).toBe(0.5);
    expect(pdfProgress(100, 100)).toBe(1);
    expect(pdfProgress(3, 0)).toBe(0);
  });
});

describe("describePosition", () => {
  it("uses pages for PDF and percentages for EPUB", () => {
    expect(
      describePosition({ format: "pdf", location: "29", progress: 0.05, pageCount: 601 }),
    ).toBe("Page 29 of 601");
    expect(
      describePosition({
        format: "epub",
        location: "epubcfi(/6/4)",
        progress: 0.123,
        pageCount: 0,
      }),
    ).toBe("12% read");
  });
});
