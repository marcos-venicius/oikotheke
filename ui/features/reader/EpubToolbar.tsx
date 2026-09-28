import {
  AArrowDown,
  AArrowUp,
  ArrowLeft,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  ScrollText,
  TableOfContents,
} from "lucide-react";
import { IconButton } from "@/components/Button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/cn";
import { FONT_SIZES, type EpubFlow } from "./epubStyles";

interface EpubToolbarProps {
  title: string;
  visible: boolean;
  fontSize: number;
  flow: EpubFlow;
  focusMode: boolean;
  tocOpen: boolean;
  hasToc: boolean;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFontSize: (direction: 1 | -1) => void;
  onFlow: (flow: EpubFlow) => void;
  onToggleToc: () => void;
  onToggleFocus: () => void;
}

const icon = "size-[18px]";

export function EpubToolbar(props: EpubToolbarProps) {
  const { fontSize, flow, visible } = props;
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
        {props.hasToc && (
          <IconButton label="Contents (T)" active={props.tocOpen} onClick={props.onToggleToc}>
            <TableOfContents className={icon} strokeWidth={1.75} />
          </IconButton>
        )}
        <span className="truncate text-sm font-medium" title={props.title}>
          {props.title}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <IconButton label="Previous page (←)" onClick={props.onPrev}>
          <ChevronLeft className={icon} strokeWidth={1.75} />
        </IconButton>
        <IconButton label="Next page (→)" onClick={props.onNext}>
          <ChevronRight className={icon} strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="flex flex-1 items-center justify-end gap-1">
        <IconButton
          label="Smaller text (−)"
          onClick={() => props.onFontSize(-1)}
          disabled={fontSize <= FONT_SIZES[0]}
        >
          <AArrowDown className={icon} strokeWidth={1.75} />
        </IconButton>
        <span className="w-12 text-center text-xs text-muted tabular-nums">{fontSize}%</span>
        <IconButton
          label="Larger text (+)"
          onClick={() => props.onFontSize(1)}
          disabled={fontSize >= FONT_SIZES[FONT_SIZES.length - 1]}
        >
          <AArrowUp className={icon} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label="Pages"
          active={flow === "paginated"}
          onClick={() => props.onFlow("paginated")}
        >
          <BookOpenText className={icon} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label="Continuous scroll"
          active={flow === "scrolled"}
          onClick={() => props.onFlow("scrolled")}
        >
          <ScrollText className={icon} strokeWidth={1.75} />
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
        <ThemeToggle />
      </div>
    </header>
  );
}
