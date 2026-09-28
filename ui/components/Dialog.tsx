import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Modal dialog on top of the native <dialog> element (focus trap and Esc for free). */
export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-border bg-surface p-0 text-text shadow-lift backdrop:bg-black/35 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div className="p-6">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <div className="mt-3 text-sm text-muted">{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
