import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, BookOpen, CircleAlert, Trash2 } from "lucide-react";
import type { Book, CatalogEntry, Note } from "@/lib/types";
import { formatBytes, formatDate, formatRelative, plural } from "@/lib/format";
import { describePosition, formatLabel } from "@/lib/location";
import { Button, IconButton } from "@/components/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/toast";
import { describeError } from "@/services/ipc";
import { libraryService } from "@/services/libraryService";
import { notesService } from "@/services/notesService";
import { BookCover } from "@/features/library/BookCover";
import { RemoveBookDialog, type RemoveMode } from "@/features/library/RemoveBookDialog";
import { groupNotes } from "@/lib/notes";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; book: Book; notes: Note[]; origin?: CatalogEntry };

export function BookDetailsPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State & { id?: string }>({ status: "loading" });
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([libraryService.getBook(id), notesService.list(id), libraryService.listCatalog()])
      .then(([book, notes, catalog]) => {
        const origin = catalog.find((entry) => entry.id === book.catalogId);
        if (active) setState({ status: "ready", book, notes, origin, id });
      })
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
              origin={current.origin}
              onRead={(location) =>
                navigate(`/read/${current.book.id}`, location ? { state: { location } } : undefined)
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
  origin,
  onRead,
  onRemove,
}: {
  book: Book;
  notes: Note[];
  /** The Discover entry the book was downloaded from. */
  origin?: CatalogEntry;
  onRead: (location?: string) => void;
  onRemove: () => void;
}) {
  const progress = book.progress;
  const groups = useMemo(() => groupNotes(book.format, notes), [book.format, notes]);
  const readable = book.status === "ready" && book.removedAt === null;
  const facts = [
    ["Format", formatLabel(book.format)],
    ...(book.pageCount > 0 ? [["Pages", String(book.pageCount)]] : []),
    ["Size", formatBytes(book.fileSize)],
    ["Added", formatDate(book.createdAt)],
    ["Last activity", formatRelative(book.updatedAt)],
    ...(origin
      ? [
          ["Source", origin.source],
          ["License", origin.license],
        ]
      : []),
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
              <CircleAlert className="size-4" /> The stored copy of this book is missing.
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
              <span>{progress > 0 ? describePosition(book) : "Not started"}</span>
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
            {groups.map((group) => (
              <li key={group.key}>
                <button
                  type="button"
                  disabled={!readable}
                  onClick={() => onRead(group.location)}
                  className="flex w-full flex-col gap-1.5 px-2 py-3.5 text-left transition-colors enabled:hover:bg-surface-2"
                >
                  <span className="text-xs font-medium text-accent">{group.label}</span>
                  <span className="flex min-w-0 flex-col gap-2">
                    {group.notes.map((note) => (
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
