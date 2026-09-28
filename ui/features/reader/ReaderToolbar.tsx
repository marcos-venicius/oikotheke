import { useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  MoveHorizontal,
  MoveVertical,
  NotebookPen,
  RectangleVertical,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ZoomMode } from "@/lib/types";
import { IconButton } from "@/components/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import { MAX_ZOOM, MIN_ZOOM } from "./readerMath";

interface ReaderToolbarProps {
  title: string;
  page: number;
  pageCount: number;
  zoom: number;
  zoomMode: ZoomMode;
  notesOpen?: boolean;
  pageHasNotes?: boolean;
  visible: boolean;
  focusMode: boolean;
  onBack: () => void;
  onGoTo: (page: number) => void;
  onZoom: (direction: 1 | -1) => void;
  onZoomMode: (mode: Exclude<ZoomMode, "custom">) => void;
  onToggleNotes?: () => void;
  onToggleFocus: () => void;
}

const icon = "size-[18px]";

export function ReaderToolbar(props: ReaderToolbarProps) {
  const { page, pageCount, zoom, zoomMode, visible } = props;

  return (
    <header
      className={cn(
        "absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur-md",
        "transition-[opacity,transform] duration-200",
        visible ? "opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <IconButton label="Back to library (Esc)" onClick={props.onBack}>
          <ArrowLeft className={icon} strokeWidth={1.75} />
        </IconButton>
        <span className="truncate text-sm font-medium" title={props.title}>
          {props.title}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          label="Previous page (←)"
          onClick={() => props.onGoTo(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className={icon} strokeWidth={1.75} />
        </IconButton>
        {/* Keyed by page so the draft resets whenever the page changes. */}
        <PageInput key={page} page={page} pageCount={pageCount} onGoTo={props.onGoTo} />
        <IconButton
          label="Next page (→)"
          onClick={() => props.onGoTo(page + 1)}
          disabled={page >= pageCount}
        >
          <ChevronRight className={icon} strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        <IconButton
          label="Zoom out (−)"
          onClick={() => props.onZoom(-1)}
          disabled={zoom <= MIN_ZOOM}
        >
          <ZoomOut className={icon} strokeWidth={1.75} />
        </IconButton>
        <span className="w-12 text-center text-xs text-muted tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <IconButton label="Zoom in (+)" onClick={() => props.onZoom(1)} disabled={zoom >= MAX_ZOOM}>
          <ZoomIn className={icon} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label="Fit page (0)"
          active={zoomMode === "fit-page"}
          onClick={() => props.onZoomMode("fit-page")}
        >
          <RectangleVertical className={icon} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label="Fit width (W)"
          active={zoomMode === "fit-width"}
          onClick={() => props.onZoomMode("fit-width")}
        >
          <MoveHorizontal className={icon} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label="Fit height (H)"
          active={zoomMode === "fit-height"}
          onClick={() => props.onZoomMode("fit-height")}
        >
          <MoveVertical className={icon} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label={props.focusMode ? "Exit focus mode (F)" : "Focus mode: full screen (F)"}
          active={props.focusMode}
          onClick={props.onToggleFocus}
        >
          {props.focusMode ? (
            <Minimize className={icon} strokeWidth={1.75} />
          ) : (
            <Maximize className={icon} strokeWidth={1.75} />
          )}
        </IconButton>
        <span className="mx-1 h-5 w-px bg-border" />
        {props.onToggleNotes && (
          <IconButton
            label="Notes (N)"
            active={props.notesOpen}
            onClick={props.onToggleNotes}
            className="relative"
          >
            <NotebookPen className={icon} strokeWidth={1.75} />
            {props.pageHasNotes && (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-bg" />
            )}
          </IconButton>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

function PageInput({
  page,
  pageCount,
  onGoTo,
}: {
  page: number;
  pageCount: number;
  onGoTo: (page: number) => void;
}) {
  const [draft, setDraft] = useState(String(page));

  const commit = () => {
    const value = Number.parseInt(draft, 10);
    if (Number.isFinite(value)) onGoTo(value);
    else setDraft(String(page));
  };

  return (
    <label className="flex items-center gap-1.5 text-sm text-muted tabular-nums">
      <input
        aria-label="Go to page"
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(String(page));
            e.currentTarget.blur();
          }
        }}
        className="h-8 rounded-md border border-border bg-surface text-center text-text outline-none focus:border-accent"
        style={{ width: `${Math.max(2, String(pageCount).length) + 2}ch` }}
      />
      <span>/ {pageCount}</span>
    </label>
  );
}
