import { useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { progressService } from "@/services/progressService";

/** Autosave for a reading session: debounced while reading, flushed on leave or window close. */
export function useProgressSaver(bookId: string) {
  const saver = useMemo(() => progressService.createSaver(bookId), [bookId]);
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(() => saver.flush());
    return () => {
      void saver.flush();
      void unlisten.then((fn) => fn());
    };
  }, [saver]);
  return saver;
}
