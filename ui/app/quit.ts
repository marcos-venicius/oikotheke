import { getCurrentWindow } from "@tauri-apps/api/window";

/** Ctrl+Q quits the app, wherever the focus is (even while typing). */
export function isQuitShortcut(e: KeyboardEvent): boolean {
  return e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === "q";
}

/**
 * Closes the window like its close button: close-requested listeners run first (the reader
 * flushes its position there), then the window is destroyed.
 */
export function quit(): void {
  void getCurrentWindow().close();
}
