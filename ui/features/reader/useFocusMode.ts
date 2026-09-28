import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Focus mode puts the window in full screen for distraction-free reading. The state follows
 * the real window (e.g. the window manager leaving full screen), and full screen is undone
 * when the reader closes if the reader turned it on.
 */
export function useFocusMode() {
  const [focus, setFocus] = useState(false);
  const enteredByReader = useRef(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let active = true;
    const sync = () =>
      win
        .isFullscreen()
        .then((value) => active && setFocus(value))
        .catch(() => {});
    void sync();
    const unlisten = win.onResized(() => void sync());
    return () => {
      active = false;
      void unlisten.then((fn) => fn());
      if (enteredByReader.current) void win.setFullscreen(false).catch(() => {});
    };
  }, []);

  const setFocusMode = useCallback((on: boolean) => {
    enteredByReader.current = on;
    setFocus(on);
    getCurrentWindow()
      .setFullscreen(on)
      .catch(() => setFocus(!on));
  }, []);

  return { focus, setFocusMode };
}
