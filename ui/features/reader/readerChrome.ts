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
