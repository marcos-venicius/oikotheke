import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, BookOpen, CircleAlert, Trash2 } from "lucide-react";
import type { Book, Note } from "@/lib/types";
import { formatBytes, formatDate, formatRelative, plural, readingProgress } from "@/lib/format";
import { Button, IconButton } from "@/components/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/toast";
import { describeError } from "@/services/ipc";
import { libraryService } from "@/services/libraryService";
import { notesService } from "@/services/notesService";
import { BookCover } from "@/features/library/BookCover";
import { RemoveBookDialog, type RemoveMode } from "@/features/library/RemoveBookDialog";
import { groupByPage } from "@/features/reader/notedPages";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; book: Book; notes: Note[] };

export function BookDetailsPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State & { id?: string }>({ status: "loading" });
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([libraryService.getBook(id), notesService.list(id)])
      .then(([book, notes]) => active && setState({ status: "ready", book, notes, id }))
      .catch((error) => active && setState({ status: "error", message: describeError(error), id }));
    return () => {
      active = false;
    };
  }, [id]);

  const current = state.id === id ? state : { status: "loading" as const };

  const confirmRemoval = async (book: Book, mode: RemoveMode) => {
    setRemoving(false);
    try {
      if (mode === "permanent") await libraryService.deleteBook(book.id);
      else await libraryService.removeBook(book.id);
      toast(
        mode === "permanent"
          ? `Deleted “${book.title}”`
          : `Removed “${book.title}” from the library`,
        {
          tone: "success",
        },
      );
      navigate("/");
    } catch (error) {
      toast("Something went wrong", { tone: "error", description: describeError(error) });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-4">
        <IconButton label="Back to library" onClick={() => navigate("/")}>
          <ArrowLeft className="size-[18px]" strokeWidth={1.75} />
        </IconButton>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pb-16">
        {current.status === "loading" && null}
        {current.status === "error" && (
          <p className="mt-24 text-center text-sm text-muted">{current.message}</p>
        )}
        {current.status === "ready" && (
          <>
            <Details
              book={current.book}
              notes={current.notes}
              onRead={(page) =>
                navigate(`/read/${current.book.id}`, page ? { state: { page } } : undefined)
              }
              onRemove={() => setRemoving(true)}
            />
            <RemoveBookDialog
              book={removing ? current.book : null}
              permanentOnly={current.book.status === "missing" || current.book.removedAt !== null}
              onCancel={() => setRemoving(false)}
              onConfirm={(book, mode) => void confirmRemoval(book, mode)}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Details({
  book,
  notes,
  onRead,
  onRemove,
}: {
  book: Book;
  notes: Note[];
  onRead: (page?: number) => void;
  onRemove: () => void;
}) {
  const progress = readingProgress(book);
  const groups = useMemo(() => groupByPage(notes), [notes]);
  const readable = book.status === "ready" && book.removedAt === null;
  const facts = [
    ["Pages", String(book.pageCount)],
    ["Size", formatBytes(book.fileSize)],
    ["Added", formatDate(book.createdAt)],
    ["Last activity", formatRelative(book.updatedAt)],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <section className="flex flex-col gap-8 pt-4 sm:flex-row sm:items-start">
        <div className="aspect-[2/3] w-44 shrink-0 overflow-hidden rounded-md bg-surface-2 shadow-lift sm:w-52">
          <BookCover book={book} />
        </div>

        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">{book.title}</h1>
          {book.author && <p className="mt-1.5 text-muted">{book.author}</p>}

          {book.status === "missing" && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm text-danger">
              <CircleAlert className="size-4" /> The stored copy of this PDF is missing.
            </p>
          )}

          <dl className="mt-6 grid max-w-md grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-0.5 font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 max-w-md">
            <div className="flex justify-between text-xs text-muted">
              <span>
                {progress > 0 ? `Page ${book.currentPage} of ${book.pageCount}` : "Not started"}
              </span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>

          <div className="mt-8 flex gap-2">
            <Button variant="primary" disabled={!readable} onClick={() => onRead()}>
              <BookOpen className="size-4" />
              {progress > 0 ? "Continue reading" : "Start reading"}
            </Button>
            <Button onClick={onRemove}>
              <Trash2 className="size-4" />
              Remove…
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-sm font-semibold tracking-tight">
          Notes{" "}
          <span className="font-normal text-muted">
            {notes.length > 0 && plural(notes.length, "note")}
          </span>
        </h2>
        {groups.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No notes yet. Press N while reading to add one.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {groups.map(({ page, notes: list }) => (
              <li key={page}>
                <button
                  type="button"
                  disabled={!readable}
                  onClick={() => onRead(page)}
                  className="flex w-full gap-6 py-3.5 text-left transition-colors enabled:hover:bg-surface-2"
                >
                  <span className="w-16 shrink-0 pl-2 text-xs font-medium text-accent tabular-nums">
                    p. {page}
                  </span>
                  <span className="flex min-w-0 flex-col gap-2">
                    {list.map((note) => (
                      <span key={note.id} className="text-sm whitespace-pre-wrap">
                        {note.content}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
