import { describe, expect, it } from "vitest";
import { contentCss, DEFAULT_FONT_SIZE, FONT_SIZES, stepFontSize } from "./epubStyles";

describe("stepFontSize", () => {
  it("moves one step and stops at the ends", () => {
    expect(stepFontSize(DEFAULT_FONT_SIZE, 1)).toBe(110);
    expect(stepFontSize(DEFAULT_FONT_SIZE, -1)).toBe(90);
    expect(stepFontSize(FONT_SIZES[0], -1)).toBe(FONT_SIZES[0]);
    expect(stepFontSize(FONT_SIZES.at(-1)!, 1)).toBe(FONT_SIZES.at(-1));
  });

  it("snaps values that aren't a step", () => {
    expect(stepFontSize(104, 1)).toBe(110);
    expect(stepFontSize(1000, -1)).toBe(175);
  });
});

describe("contentCss", () => {
  const theme = { text: "#111", accent: "#c05", background: "#fafafa" };

  it("applies the font size and only overrides colors in dark mode", () => {
    const light = contentCss(120, { ...theme, dark: false });
    expect(light).toContain("font-size: 120% !important");
    expect(light).toContain("color-scheme: light");
    expect(light).toContain("--theme-bg-color: #fafafa");
    expect(light).not.toContain("background-color: transparent");

    const dark = contentCss(100, { ...theme, dark: true });
    expect(dark).toContain("color-scheme: dark");
    expect(dark).toContain("color: #111 !important");
  });
});
