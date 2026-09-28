import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { Book } from "@/lib/types";
import { describeError } from "@/services/ipc";
import { libraryService } from "@/services/libraryService";
import { EpubReader } from "./EpubReader";
import { PdfReader } from "./PdfReader";
import { ReaderError, ReaderLoading } from "./ReaderStatus";

type State =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; book: Book };

/** Loads the book record and hands it to the reader for its format. */
export function ReaderPage() {
  const { id = "" } = useParams();
  // Tagged with the book it belongs to, so switching books shows "loading" without a reset.
  const [state, setState] = useState<State & { id?: string }>({ status: "loading" });

  useEffect(() => {
    let active = true;
    libraryService
      .getBook(id)
      .then((book) => {
        if (book.status === "missing") throw new Error("The stored copy of this book is missing.");
        if (active) setState({ status: "ready", book, id });
      })
      .catch((error) => active && setState({ status: "error", message: describeError(error), id }));
    return () => {
      active = false;
    };
  }, [id]);

  const current = state.id === id ? state : { status: "loading" as const };
  if (current.status === "loading") return <ReaderLoading />;
  if (current.status === "error") return <ReaderError message={current.message} />;
  const { book } = current;
  return book.format === "epub" ? (
    <EpubReader key={book.id} book={book} />
  ) : (
    <PdfReader key={book.id} book={book} />
  );
}
