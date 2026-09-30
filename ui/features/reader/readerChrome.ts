import { useCallback, useEffect, useRef, useState } from "react";

const CHROME_IDLE_MS = 2500;

/** True while the user types in a field, so reader shortcuts stay out of the way. */
export function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName))
  );
}

/** Reader shortcuts are off while typing or while a dialog is open (it handles its own keys). */
export function ignoresShortcuts(target: EventTarget | null): boolean {
  return isTyping(target) || document.querySelector("dialog[open]") !== null;
}

/** Toolbar and scrubber fade out after a moment without pointer movement. */
export function useChromeVisibility() {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const scheduleHide = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Keep the chrome while the user is typing in it (e.g. the page input).
      if (!isTyping(document.activeElement)) setVisible(false);
    }, CHROME_IDLE_MS);
  }, []);

  const poke = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => clearTimeout(timer.current);
  }, [scheduleHide]);

  return { visible, poke };
}

/** Wheel distance (pixels) that makes one zoom step; touchpads send many small deltas. */
const WHEEL_ZOOM_THRESHOLD = 50;
const LINE_HEIGHT = 40;

/**
 * Tracks Ctrl + wheel for zooming: returns 1 (zoom in, wheel up), -1 (zoom out) or 0, at most one
 * step per event. Listen with `{ passive: false }` so the webview's own zoom is cancelled.
 */
export function ctrlWheelZoom() {
  let delta = 0;
  return (e: WheelEvent): 1 | -1 | 0 => {
    if (!e.ctrlKey || e.deltaY === 0) return 0;
    e.preventDefault();
    const step = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * LINE_HEIGHT;
    // Start over when the direction changes.
    delta = Math.sign(step) === Math.sign(delta) ? delta + step : step;
    if (Math.abs(delta) < WHEEL_ZOOM_THRESHOLD) return 0;
    delta = 0;
    return step < 0 ? 1 : -1;
  };
}
