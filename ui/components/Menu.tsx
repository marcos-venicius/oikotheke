import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

interface MenuProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
}

/** Closes a popup on a pointer down outside `ref` or on Esc. */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the menu closes: the page's own Esc (e.g. back to the library) must not run too.
      e.stopImmediatePropagation();
      close();
    };
    const onBlur = () => close();
    document.addEventListener("pointerdown", onPointer);
    // Capture, so this runs before the window listeners that handle Esc for the page.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onBlur);
    };
  }, [ref, open, close]);
}

const panelClass = "z-40 min-w-44 rounded-xl border border-border bg-surface p-1 shadow-lift";

function MenuItems({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return items.map((item) => (
    <button
      key={item.label}
      type="button"
      role="menuitem"
      onClick={() => {
        onClose();
        item.onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2",
        item.danger ? "text-danger" : "text-text",
      )}
    >
      {item.icon}
      {item.label}
    </button>
  ));
}

export function Menu({ trigger, items, align = "right", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          className={cn(
            panelClass,
            "absolute top-full mt-1",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <MenuItems items={items} onClose={close} />
        </div>
      )}
    </div>
  );
}

/** Where a context menu was asked for, in viewport coordinates. */
export interface MenuPoint {
  x: number;
  y: number;
}

const EDGE = 8;

/** A menu opened at the pointer (right click), kept inside the window. */
export function ContextMenu({
  at,
  items,
  onClose,
}: {
  at: MenuPoint | null;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint | null>(null);
  useDismiss(ref, at !== null, onClose);

  // Flip/shift once the size is known so the menu never overflows the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!at || !el) {
      setPos(null);
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const x = at.x + width + EDGE > window.innerWidth ? at.x - width : at.x;
    const y = at.y + height + EDGE > window.innerHeight ? at.y - height : at.y;
    setPos({ x: Math.max(EDGE, x), y: Math.max(EDGE, y) });
    el.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
  }, [at]);

  if (!at) return null;
  // Portalled: a transformed ancestor (e.g. a lifted book cover) would offset `position: fixed`.
  return createPortal(
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className={cn(panelClass, "fixed")}
      style={{ left: pos?.x ?? at.x, top: pos?.y ?? at.y, visibility: pos ? "visible" : "hidden" }}
    >
      <MenuItems items={items} onClose={onClose} />
    </div>,
    document.body,
  );
}
