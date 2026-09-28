import { useState } from "react";
import { cn } from "@/lib/cn";

interface FractionScrubberProps {
  /** Reading position in [0, 1]. */
  fraction: number;
  label?: string;
  /** Fractions to mark on the bar (e.g. where notes are). */
  marks?: number[];
  visible: boolean;
  onGoTo: (fraction: number) => void;
}

const STEPS = 1000;

/** Progress bar for reflowable books, which have no fixed pages. Navigates on release. */
export function FractionScrubber({
  fraction,
  label,
  marks = [],
  visible,
  onGoTo,
}: FractionScrubberProps) {
  const [drag, setDrag] = useState<{ from: number; value: number } | null>(null);
  const preview = drag?.from === fraction ? drag.value : null;
  const shown = preview ?? fraction;
  const commit = () => {
    if (preview !== null && preview !== fraction) onGoTo(preview);
  };

  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 z-20 px-6 pt-6 pb-3 transition-opacity duration-200",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="relative mx-auto max-w-3xl">
        <div className="mb-2 flex justify-between gap-4 text-xs text-muted">
          <span className="truncate">{label}</span>
          <span className="tabular-nums">{Math.round(shown * 100)}%</span>
        </div>
        <div className="relative h-1 rounded-full bg-border">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-accent"
            style={{ width: `${shown * 100}%` }}
          />
          {marks.map((mark) => (
            <span
              key={mark}
              className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text/70"
              style={{ left: `${mark * 100}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          aria-label="Reading position"
          min={0}
          max={STEPS}
          value={Math.round(shown * STEPS)}
          onChange={(e) => setDrag({ from: fraction, value: Number(e.target.value) / STEPS })}
          onPointerUp={commit}
          onKeyUp={commit}
          className="absolute inset-x-0 bottom-[-8px] h-5 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}
