import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { debounce } from "@/lib/debounce";
import { IconButton } from "@/components/Button";
import type { SearchStatus } from "./useSearch";

const QUERY_DELAY_MS = 300;

interface SearchBarProps {
  status: SearchStatus;
  /** Changes every time the user asks for the search (Ctrl+F), to focus the field again. */
  focusSignal: number;
  onQuery: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/** Find-in-book field shared by the readers; each reader runs the search for its format. */
export function SearchBar({
  status,
  focusSignal,
  onQuery,
  onNext,
  onPrev,
  onClose,
}: SearchBarProps) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [committed, setCommitted] = useState("");
  const commit = useMemo(
    () =>
      debounce((query: string) => {
        setCommitted(query.trim());
        onQuery(query.trim());
      }, QUERY_DELAY_MS),
    [onQuery],
  );
  useEffect(() => () => commit.cancel(), [commit]);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusSignal]);

  const { total, current, searching } = status;
  const label =
    total === 0
      ? searching
        ? "Searching…"
        : committed && committed === draft.trim()
          ? "No results"
          : ""
      : `${current === null ? "–" : current + 1} / ${total}${searching ? "+" : ""}`;

  return (
    <div
      role="search"
      className="absolute top-16 right-4 z-30 flex items-center gap-1 rounded-xl border border-border bg-surface py-1 pr-1 pl-3 shadow-lift"
    >
      <Search className="size-4 shrink-0 text-muted" strokeWidth={1.75} />
      <input
        ref={input}
        type="text"
        aria-label="Search in book"
        placeholder="Search in book"
        spellCheck={false}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // Enter right after typing starts the search; then it steps through the hits.
            if (draft.trim() !== committed) commit.flush();
            else if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        className="h-8 w-56 bg-transparent text-sm text-text outline-none placeholder:text-muted"
      />
      <span className="min-w-16 text-right text-xs text-muted tabular-nums" aria-live="polite">
        {label}
      </span>
      <IconButton label="Previous result (Shift+Enter)" onClick={onPrev} disabled={total === 0}>
        <ChevronUp className="size-4" strokeWidth={1.75} />
      </IconButton>
      <IconButton label="Next result (Enter)" onClick={onNext} disabled={total === 0}>
        <ChevronDown className="size-4" strokeWidth={1.75} />
      </IconButton>
      <IconButton label="Close search (Esc)" onClick={onClose}>
        <X className="size-4" strokeWidth={1.75} />
      </IconButton>
    </div>
  );
}
