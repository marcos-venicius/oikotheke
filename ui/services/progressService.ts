import type { ReadingProgress } from "@/lib/types";
import { debounce } from "@/lib/debounce";
import { call } from "./ipc";

const SAVE_DELAY = 400;

export const progressService = {
  save: (bookId: string, progress: ReadingProgress) =>
    call<void>("save_progress", { id: bookId, progress }),

  /**
   * Debounced autosave for one reading session. Call `flush()` when leaving the reader or
   * closing the window so the latest position is always persisted.
   */
  createSaver(bookId: string) {
    let inflight: Promise<void> = Promise.resolve();
    const write = debounce((progress: ReadingProgress) => {
      inflight = progressService.save(bookId, progress).catch((error) => {
        console.error("failed to save reading progress", error);
      });
    }, SAVE_DELAY);
    return {
      schedule: (progress: ReadingProgress) => write(progress),
      flush: async () => {
        write.flush();
        await inflight;
      },
    };
  },
};
