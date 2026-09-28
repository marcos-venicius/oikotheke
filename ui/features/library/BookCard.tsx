import {
  ArchiveRestore,
  CircleAlert,
  Info,
  MoreHorizontal,
  StickyNote,
  Trash2,
} from "lucide-react";
import type { Book } from "@/lib/types";
import { Menu, type MenuItem } from "@/components/Menu";
import { cn } from "@/lib/cn";
import { BookCover } from "./BookCover";

interface BookCardProps {
  book: Book;
  onOpen?: () => void;
  onDetails?: () => void;
  onRemove?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
}

export function BookCard({
  book,
  onOpen,
  onDetails,
  onRemove,
  onRestore,
  onDelete,
}: BookCardProps) {
  const progress = book.progress;
  const missing = book.status === "missing";
  const removed = book.removedAt !== null;

  const items: MenuItem[] = [];
  if (onDetails)
    items.push({ label: "Details", icon: <Info className="size-4" />, onSelect: onDetails });
  if (onRestore)
    items.push({
      label: "Restore",
      icon: <ArchiveRestore className="size-4" />,
      onSelect: onRestore,
    });
  if (onRemove)
    items.push({
      label: "Remove…",
      icon: <Trash2 className="size-4" />,
      danger: true,
      onSelect: onRemove,
    });
  if (onDelete)
    items.push({
      label: "Delete permanently",
      icon: <Trash2 className="size-4" />,
      danger: true,
      onSelect: onDelete,
    });

  return (
    <div className="group flex flex-col">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={`Open ${book.title}`}
        className={cn(
          "relative aspect-[2/3] w-full overflow-hidden rounded-md bg-surface-2 shadow-soft",
          "transition-[transform,box-shadow] duration-200 ease-out",
          onOpen && "group-hover:-translate-y-1 group-hover:shadow-lift",
          (missing || removed) && "opacity-60 grayscale",
        )}
      >
        <BookCover book={book} />
        {/* Subtle spine highlight for a book-like feel. */}
        <span className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-r from-black/15 to-transparent" />
        {book.noteCount > 0 && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <StickyNote className="size-3" />
            {book.noteCount}
          </span>
        )}
        {missing && (
          <span className="absolute inset-x-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-[11px] font-medium text-white">
            <CircleAlert className="size-3.5" /> File missing
          </span>
        )}
      </button>

      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="mt-2 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] leading-snug font-medium" title={book.title}>
            {book.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {[book.author, progress > 0 ? `${Math.round(progress * 100)}%` : "New"]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {items.length > 0 && (
          <Menu
            items={items}
            trigger={({ open, toggle }) => (
              <button
                type="button"
                aria-label={`Actions for ${book.title}`}
                onClick={toggle}
                className={cn(
                  "-mr-1 rounded-md p-1 text-muted transition-opacity hover:bg-surface-2 hover:text-text",
                  open
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                )}
              >
                <MoreHorizontal className="size-4" />
              </button>
            )}
          />
        )}
      </div>
    </div>
  );
}
