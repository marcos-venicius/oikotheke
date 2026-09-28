import { describe, expect, it } from "vitest";
import { formatBytes, plural } from "./format";

describe("format", () => {
  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
  });

  it("pluralizes", () => {
    expect(plural(1, "note")).toBe("1 note");
    expect(plural(2, "note")).toBe("2 notes");
  });
});
