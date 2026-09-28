import { useEffect, useState } from "react";
import type { Book } from "@/lib/types";
import { describeError } from "@/services/ipc";
import { libraryService } from "@/services/libraryService";
import { openDocument } from "@/services/pdfService";
import { PageRenderer } from "./pageRenderer";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; book: Book; renderer: PageRenderer };

/** Loads the book and opens its PDF once for the whole reading session. */
export function useReaderDocument(bookId: string): State {
  // Tagged with the book it belongs to, so switching books shows "loading" without a reset.
  const [state, setState] = useState<State & { bookId?: string }>({ status: "loading" });

  useEffect(() => {
    let active = true;
    let renderer: PageRenderer | null = null;
    let task: ReturnType<typeof openDocument> | null = null;

    (async () => {
      try {
        const book = await libraryService.getBook(bookId);
        if (book.status === "missing") throw new Error("The stored copy of this book is missing.");
        task = openDocument(book);
        const doc = await task.promise;
        if (!active) return;
        renderer = new PageRenderer(doc);
        setState({ status: "ready", book, renderer, bookId });
      } catch (error) {
        if (active) setState({ status: "error", message: describeError(error), bookId });
      }
    })();

    return () => {
      active = false;
      renderer?.destroy();
      void task?.destroy();
    };
  }, [bookId]);

  return state.bookId === bookId ? state : { status: "loading" };
}
