import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowLeft, BookOpen, FileDown, Plus } from "lucide-react";
import type { Book } from "@/lib/types";
import { useStore } from "@/lib/store";
import { Button, IconButton } from "@/components/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/toast";
import { describeError } from "@/services/ipc";
import { importJobs, importService } from "@/services/importService";
import { libraryService } from "@/services/libraryService";
import { BookCard } from "./BookCard";
import { ImportCard } from "./ImportCard";
import { RemoveBookDialog, type RemoveMode } from "./RemoveBookDialog";
import { libraryStore, refreshLibrary } from "./libraryStore";
import { useFileDrop } from "./useFileDrop";

type View = "shelf" | "removed";

async function importPaths(paths: string[]) {
  try {
    await importService.importFiles(paths);
  } catch (error) {
    toast("Import failed", { tone: "error", description: describeError(error) });
  }
}

async function pickFiles() {
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "PDF documents", extensions: ["pdf", "PDF"] }],
  });
  if (selected) await importPaths(selected);
}

export function LibraryPage() {
  const navigate = useNavigate();
  const { books, removed, loaded } = useStore(libraryStore);
  const jobs = useStore(importJobs);
  const [view, setView] = useState<View>("shelf");
  const [pendingRemoval, setPendingRemoval] = useState<{
    book: Book;
    permanentOnly: boolean;
  } | null>(null);

  useEffect(() => {
    importService.init();
    refreshLibrary()
      .then((list) => importService.resume(list))
      .catch((error) =>
        toast("Could not load the library", { tone: "error", description: describeError(error) }),
      );

    const offReady = importService.onBookReady((book) => {
      void refreshLibrary();
      toast(`Added “${book.title}”`, { tone: "success" });
    });
    const offFailure = importService.onFailure((job) =>
      toast(`Couldn't import ${job.fileName}`, { tone: "error", description: job.error }),
    );
    return () => {
      offReady();
      offFailure();
    };
  }, []);

  const hovering = useFileDrop(useCallback((paths: string[]) => void importPaths(paths), []));

  const shelf = books.filter((b) => b.status !== "importing");
  const showRemoved = view === "removed";
  const visible = showRemoved ? removed : shelf;

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      await refreshLibrary();
      toast(success, { tone: "success" });
    } catch (error) {
      toast("Something went wrong", { tone: "error", description: describeError(error) });
    }
  };

  const confirmRemoval = (book: Book, mode: RemoveMode) => {
    setPendingRemoval(null);
    if (mode === "permanent") {
      void runAction(() => libraryService.deleteBook(book.id), `Deleted “${book.title}”`);
    } else {
      void runAction(
        () => libraryService.removeBook(book.id),
        `Removed “${book.title}” from the library`,
      );
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 px-6">
        {showRemoved && (
          <IconButton label="Back to library" onClick={() => setView("shelf")} className="-ml-2">
            <ArrowLeft className="size-[18px]" strokeWidth={1.75} />
          </IconButton>
        )}
        <h1 className="text-[15px] font-semibold tracking-tight">
          {showRemoved ? "Removed" : "Library"}
        </h1>
        {loaded && visible.length > 0 && (
          <span className="text-sm text-muted">{visible.length}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!showRemoved && removed.length > 0 && (
            <Button variant="ghost" className="text-muted" onClick={() => setView("removed")}>
              Removed
            </Button>
          )}
          {!showRemoved && (
            <Button variant="primary" onClick={() => void pickFiles()} className="mr-1">
              <Plus className="size-4" strokeWidth={2} />
              Import
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-10">
        {loaded && visible.length === 0 && jobs.length === 0 ? (
          showRemoved ? (
            <p className="mt-24 text-center text-sm text-muted">Nothing here.</p>
          ) : (
            <EmptyState onImport={() => void pickFiles()} />
          )
        ) : (
          <div className="mx-auto grid max-w-[1400px] grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-x-7 gap-y-10">
            {!showRemoved && jobs.map((job) => <ImportCard key={job.jobId} job={job} />)}
            {visible.map((book) =>
              showRemoved ? (
                <BookCard
                  key={book.id}
                  book={book}
                  onRestore={() =>
                    void runAction(
                      () => libraryService.restoreBook(book.id),
                      `Restored “${book.title}”`,
                    )
                  }
                  onDelete={() => setPendingRemoval({ book, permanentOnly: true })}
                />
              ) : (
                <BookCard
                  key={book.id}
                  book={book}
                  onOpen={book.status === "ready" ? () => navigate(`/read/${book.id}`) : undefined}
                  onDetails={() => navigate(`/book/${book.id}`)}
                  onRemove={() =>
                    setPendingRemoval({ book, permanentOnly: book.status === "missing" })
                  }
                />
              ),
            )}
          </div>
        )}
      </main>

      {hovering && <DropOverlay />}

      <RemoveBookDialog
        book={pendingRemoval?.book ?? null}
        permanentOnly={pendingRemoval?.permanentOnly}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={confirmRemoval}
      />
    </div>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center pb-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-2">
        <BookOpen className="size-6 text-muted" strokeWidth={1.5} />
      </div>
      <h2 className="mt-5 text-base font-semibold tracking-tight">Your shelf is empty</h2>
      <p className="mt-1.5 max-w-xs text-sm text-muted">
        Import PDFs or drop them anywhere in this window. Files are copied and stay on this
        computer.
      </p>
      <Button variant="primary" className="mt-6" onClick={onImport}>
        <Plus className="size-4" strokeWidth={2} />
        Import PDFs
      </Button>
    </div>
  );
}

function DropOverlay() {
  return (
    <div className="pointer-events-none fixed inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-bg/85 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 text-center">
        <FileDown className="size-8 text-accent" strokeWidth={1.5} />
        <p className="text-sm font-medium">Drop PDFs to add them to your library</p>
        <p className="text-xs text-muted">A copy of each file is kept by PDF Shelf</p>
      </div>
    </div>
  );
}
