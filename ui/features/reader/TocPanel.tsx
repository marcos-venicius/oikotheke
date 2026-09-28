import { X } from "lucide-react";
import type { TocItem } from "foliate-js/view.js";
import { IconButton } from "@/components/Button";
import { cn } from "@/lib/cn";

interface TocPanelProps {
  toc: TocItem[];
  /** Label of the chapter being read, highlighted in the list. */
  current?: string;
  onGoTo: (href: string) => void;
  onClose: () => void;
}

export function TocPanel({ toc, current, onGoTo, onClose }: TocPanelProps) {
  return (
    <aside
      aria-label="Contents"
      className="flex h-full w-[320px] shrink-0 flex-col border-r border-border bg-surface"
    >
      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <span className="text-sm font-semibold tracking-tight">Contents</span>
        <IconButton label="Close contents (T)" onClick={onClose} className="ml-auto">
          <X className="size-4" />
        </IconButton>
      </div>
      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
        <TocList items={toc} depth={0} current={current} onGoTo={onGoTo} />
      </nav>
    </aside>
  );
}

function TocList({
  items,
  depth,
  current,
  onGoTo,
}: {
  items: TocItem[];
  depth: number;
  current?: string;
  onGoTo: (href: string) => void;
}) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={`${item.href}-${i}`}>
          <button
            type="button"
            onClick={() => onGoTo(item.href)}
            style={{ paddingLeft: `${0.625 + depth * 0.875}rem` }}
            className={cn(
              "block w-full rounded-md py-1.5 pr-2.5 text-left text-sm transition-colors hover:bg-surface-2",
              item.label === current ? "bg-surface-2 font-medium text-accent" : "text-text",
            )}
          >
            {item.label}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <TocList items={item.subitems} depth={depth + 1} current={current} onGoTo={onGoTo} />
          )}
        </li>
      ))}
    </ul>
  );
}
