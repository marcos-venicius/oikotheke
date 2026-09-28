import { useState } from "react";
import { cn } from "@/lib/cn";

interface PageScrubberProps {
  page: number;
  pageCount: number;
  /** Pages that have notes, shown as markers. */
  markedPages?: number[];
  visible: boolean;
  onGoTo: (page: number) => void;
}

/** Slim progress bar at the bottom of the reader. Navigates on release, not while dragging. */
export function PageScrubber({
  page,
  pageCount,
  markedPages = [],
  visible,
  onGoTo,
}: PageScrubberProps) {
  // The preview belongs to the page it started from, so it resets once navigation happens.
  const [drag, setDrag] = useState<{ from: number; value: number } | null>(null);
  const preview = drag?.from === page ? drag.value : null;

  const shown = preview ?? page;
  const ratio = (p: number) => (pageCount <= 1 ? 0 : (p - 1) / (pageCount - 1));
  const commit = () => {
    if (preview !== null && preview !== page) onGoTo(preview);
  };

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 px-6 pt-6 pb-3 transition-opacity duration-200",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="relative mx-auto max-w-3xl">
        {preview !== null && (
          <span
            className="absolute -top-8 -translate-x-1/2 rounded-md bg-text px-2 py-1 text-xs font-medium text-bg tabular-nums"
            style={{ left: `${ratio(shown) * 100}%` }}
          >
            {shown}
          </span>
        )}
        <div className="relative h-1 rounded-full bg-border">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{ width: `${ratio(shown) * 100}%` }}
          />
          {markedPages.map((p) => (
            <span
              key={p}
              className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text/70"
              style={{ left: `${ratio(p) * 100}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          aria-label="Page"
          min={1}
          max={Math.max(1, pageCount)}
          value={shown}
          onChange={(e) => setDrag({ from: page, value: Number(e.target.value) })}
          onPointerUp={commit}
          onKeyUp={commit}
          className="absolute inset-x-0 -top-2 h-5 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
