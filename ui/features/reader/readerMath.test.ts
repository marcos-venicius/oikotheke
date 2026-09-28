import { describe, expect, it } from "vitest";
import { CSS_UNITS, clampPage, fitZoom, renderWindow, stepZoom } from "./readerMath";

describe("readerMath", () => {
  it("clamps pages", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(4.6, 10)).toBe(5);
    expect(clampPage(NaN, 10)).toBe(1);
    expect(clampPage(3, 0)).toBe(1);
  });

  it("builds the render window with the current page first", () => {
    expect(renderWindow(5, 100)).toEqual([5, 6, 7, 8, 4]);
    expect(renderWindow(1, 100)).toEqual([1, 2, 3, 4]);
    expect(renderWindow(99, 100)).toEqual([99, 100, 98]);
    expect(renderWindow(1, 1)).toEqual([1]);
  });

  it("steps zoom from arbitrary values", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(1.03, 1)).toBe(1.1);
    expect(stepZoom(1.03, -1)).toBe(1);
    expect(stepZoom(5, 1)).toBe(5);
    expect(stepZoom(0.25, -1)).toBe(0.25);
  });

  it("fits pages to the box", () => {
    const page = { width: 600, height: 800 };
    const box = { width: 600 * CSS_UNITS, height: 400 * CSS_UNITS };
    expect(fitZoom(page, box, "fit-width")).toBeCloseTo(1);
    expect(fitZoom(page, box, "fit-page")).toBeCloseTo(0.5);
  });
});
