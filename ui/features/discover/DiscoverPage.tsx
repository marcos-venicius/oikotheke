import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, BookOpen, Download, Search } from "lucide-react";
import type { CatalogEntry } from "@/lib/types";
import {
  catalogStatus,
  filterCatalog,
  languageLabel,
  shelves,
  type CatalogStatus,
  type Shelf,
} from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { formatLabel } from "@/lib/location";
import { useStore } from "@/lib/store";
import { Button, IconButton } from "@/components/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/toast";
import { describeError } from "@/services/ipc";
import { importJobs, importService, type ImportJobState } from "@/services/importService";
import { libraryService } from "@/services/libraryService";
import { PlaceholderCover } from "../library/BookCover";
import { libraryStore, refreshLibrary } from "../library/libraryStore";
import { useImportNotifications } from "../library/useImportNotifications";

/** Free books to download and import. The catalog is bundled: opening this page needs no network. */
export function DiscoverPage() {
  const navigate = useNavigate();
  const { books, removed } = useStore(libraryStore);
  const jobs = useStore(importJobs);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [shelf, setShelf] = useState<Shelf>("all");
  const [query, setQuery] = useState("");

  useImportNotifications();
  useEffect(() => {
    Promise.all([libraryService.listCatalog(), refreshLibrary()])
      .then(([entries]) => setCatalog(entries))
      .catch((error) =>
        toast("Could not load Discover", { tone: "error", description: describeError(error) }),
      );
  }, []);

  const visible = useMemo(() => filterCatalog(catalog, shelf, query), [catalog, shelf, query]);

  const importEntry = async (entry: CatalogEntry) => {
    try {
      await importService.importFromCatalog(entry.id);
    } catch (error) {
      toast(`Couldn't import ${entry.title}`, {
        tone: "error",
        description: describeError(error),
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 px-6">
        <IconButton label="Back to library" onClick={() => navigate("/")} className="-ml-2">
          <ArrowLeft className="size-[18px]" strokeWidth={1.75} />
        </IconButton>
        <h1 className="text-[15px] font-semibold tracking-tight">Discover</h1>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-10">
        <div className="mx-auto max-w-[1400px]">
          <p className="text-sm font-medium">Free public-domain and openly licensed books</p>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Books are downloaded from their official sources (Project Gutenberg, Standard Ebooks,
            authors&apos; sites) only when you import them. Nothing else leaves your computer.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Shelves" className="flex flex-wrap gap-1">
              {shelves.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={shelf === id}
                  onClick={() => setShelf(id)}
                  className={cn(
                    "h-8 rounded-full px-3 text-[13px] transition-colors duration-150",
                    shelf === id
                      ? "bg-surface-2 font-medium text-text"
                      : "text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="relative ml-auto w-full sm:w-64">
              <span className="sr-only">Search by title or author</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Title or author"
                className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-8 text-sm outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
          </div>

          {catalog.length > 0 && visible.length === 0 ? (
            <p className="mt-24 text-center text-sm text-muted">No books match “{query.trim()}”.</p>
          ) : (
            <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-x-7 gap-y-10">
              {visible.map((entry) => (
                <CatalogCard
                  key={entry.id}
                  entry={entry}
                  status={catalogStatus(entry, books, removed, jobs)}
                  onImport={() => void importEntry(entry)}
                  onOpen={(id) => navigate(`/read/${id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function CatalogCard({
  entry,
  status,
  onImport,
  onOpen,
}: {
  entry: CatalogEntry;
  status: CatalogStatus<ImportJobState>;
  onImport: () => void;
  onOpen: (bookId: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <div
        className="relative aspect-[2/3] w-full overflow-hidden rounded-md shadow-soft"
        title={entry.description}
      >
        <PlaceholderCover title={entry.title} author={entry.author} />
        <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-r from-black/15 to-transparent" />
      </div>

      <p className="mt-3 line-clamp-2 text-[13px] leading-snug font-medium" title={entry.title}>
        {entry.title}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted" title={entry.author}>
        {entry.author} · {entry.year}
      </p>
      <p
        className="mt-0.5 truncate text-[11px] text-muted"
        title={`${languageLabel(entry.language)} · ${entry.source} · ${entry.license}`}
      >
        {formatLabel(entry.format)} · {entry.license}
      </p>

      {/* Pinned to the bottom so actions line up when titles wrap. */}
      <div className="mt-auto pt-2.5">
        <CardAction status={status} onImport={onImport} onOpen={onOpen} />
      </div>
    </div>
  );
}

function CardAction({
  status,
  onImport,
  onOpen,
}: {
  status: CatalogStatus<ImportJobState>;
  onImport: () => void;
  onOpen: (bookId: string) => void;
}) {
  const base = "h-8 w-full text-[13px]";
  switch (status.kind) {
    case "available":
      return (
        <Button className={base} onClick={onImport}>
          <Download className="size-3.5" strokeWidth={2} />
          Import
        </Button>
      );
    case "importing": {
      const { job } = status;
      const label =
        job.stage === "queued"
          ? "Waiting…"
          : job.stage === "processing"
            ? "Preparing…"
            : job.totalBytes > 0
              ? `Downloading ${Math.floor((job.copiedBytes / job.totalBytes) * 100)}%`
              : "Downloading…";
      return (
        <Button className={base} disabled aria-busy>
          {label}
        </Button>
      );
    }
    case "inLibrary":
      return (
        <Button
          variant="ghost"
          className={base}
          disabled={status.book.status !== "ready"}
          onClick={() => onOpen(status.book.id)}
        >
          <BookOpen className="size-3.5" strokeWidth={2} />
          Open
        </Button>
      );
    case "removed":
      return (
        <p className="flex h-8 items-center justify-center text-center text-[11px] text-muted">
          In Removed — restore it from the library
        </p>
      );
  }
}
