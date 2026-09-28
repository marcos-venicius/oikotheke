import { describe, expect, it } from "vitest";
import { pdfLocation, pdfPage, pdfProgress } from "./location";

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
