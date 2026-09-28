import { useEffect, useState } from "react";
import type { Book } from "@/lib/types";
import { describeError } from "@/services/ipc";
import { openDocument } from "@/services/pdfService";
import { PageRenderer } from "./pageRenderer";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; renderer: PageRenderer };

/** Opens the book's PDF once for the whole reading session. */
export function useReaderDocument(book: Book): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    let renderer: PageRenderer | null = null;
    let task: ReturnType<typeof openDocument> | null = null;

    (async () => {
      try {
        task = openDocument(book);
        const doc = await task.promise;
        if (!active) return;
        renderer = new PageRenderer(doc);
        setState({ status: "ready", renderer });
      } catch (error) {
        if (active) setState({ status: "error", message: describeError(error) });
      }
    })();

    return () => {
      active = false;
      renderer?.destroy();
      void task?.destroy();
    };
  }, [book]);

  return state;
}
