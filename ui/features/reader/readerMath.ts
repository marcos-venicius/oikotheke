import type { ZoomMode } from "@/lib/types";

/** PDF points are 1/72 in, CSS pixels 1/96 in: 100% zoom renders at this scale. */
export const CSS_UNITS = 96 / 72;

export const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
];
export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** Pages kept rendered around the current one. */
export const PAGES_AHEAD = 3;
export const PAGES_BEHIND = 1;

export interface Size {
  width: number;
  height: number;
}

export function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.round(page)), Math.max(1, total));
}

/** Current page first (render priority), then the next pages, then the previous ones. */
export function renderWindow(
  current: number,
  total: number,
  ahead = PAGES_AHEAD,
  behind = PAGES_BEHIND,
): number[] {
  const pages = [current];
  for (let i = 1; i <= ahead; i++) if (current + i <= total) pages.push(current + i);
  for (let i = 1; i <= behind; i++) if (current - i >= 1) pages.push(current - i);
  return pages;
}

/** Next zoom step in a direction, starting from any (possibly fitted) zoom. */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((z) => z > current + 0.001) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? MIN_ZOOM;
}

/** Zoom (1 = 100%) that fits a page of `page` points into `box` CSS pixels. */
export function fitZoom(page: Size, box: Size, mode: Exclude<ZoomMode, "custom">): number {
  if (page.width <= 0 || page.height <= 0 || box.width <= 0 || box.height <= 0) return 1;
  const byWidth = box.width / (page.width * CSS_UNITS);
  const byHeight = box.height / (page.height * CSS_UNITS);
  const zoom =
    mode === "fit-width" ? byWidth : mode === "fit-height" ? byHeight : Math.min(byWidth, byHeight);
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}
