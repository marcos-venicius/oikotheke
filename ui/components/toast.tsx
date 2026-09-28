import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createStore, useStore } from "@/lib/store";
import { cn } from "@/lib/cn";

type ToastTone = "info" | "success" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

const toasts = createStore<Toast[]>([]);
let nextId = 1;

function dismiss(id: number) {
  toasts.set((list) => list.filter((t) => t.id !== id));
}

export function toast(title: string, options: { tone?: ToastTone; description?: string } = {}) {
  const id = nextId++;
  const tone = options.tone ?? "info";
  toasts.set((list) => [...list.slice(-3), { id, tone, title, description: options.description }]);
  window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 3500);
}

export function Toaster() {
  const list = useStore(toasts);
  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-lift"
        >
          {t.tone === "error" ? (
            <CircleAlert className="mt-px size-4 shrink-0 text-danger" />
          ) : (
            <CircleCheck
              className={cn(
                "mt-px size-4 shrink-0",
                t.tone === "success" ? "text-accent" : "text-muted",
              )}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.title}</p>
            {t.description && (
              <p className="mt-0.5 text-xs break-words text-muted">{t.description}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="rounded text-muted hover:text-text"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
