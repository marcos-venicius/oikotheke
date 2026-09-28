import { useState } from "react";
import type { Book } from "@/lib/types";
import { plural } from "@/lib/format";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { cn } from "@/lib/cn";

export type RemoveMode = "library" | "permanent";

interface RemoveBookDialogProps {
  book: Book | null;
  /** Soft-removed books can only be deleted permanently. */
  permanentOnly?: boolean;
  onCancel: () => void;
  onConfirm: (book: Book, mode: RemoveMode) => void;
}

export function RemoveBookDialog({
  book,
  permanentOnly,
  onCancel,
  onConfirm,
}: RemoveBookDialogProps) {
  const [mode, setMode] = useState<RemoveMode>("library");
  const effective = permanentOnly ? "permanent" : mode;

  const close = () => {
    setMode("library");
    onCancel();
  };

  const options: Array<{ value: RemoveMode; title: string; description: string }> = [
    {
      value: "library",
      title: "Remove from library",
      description:
        "Hides the book from your shelf. The stored file, progress and notes are kept and can be restored.",
    },
    {
      value: "permanent",
      title: "Delete permanently",
      description: `Deletes the stored PDF copy, its cover, reading progress${
        book?.noteCount ? ` and ${plural(book.noteCount, "note")}` : ""
      }. This can't be undone.`,
    },
  ];

  return (
    <Dialog
      open={book !== null}
      onClose={close}
      title={book ? `Remove “${book.title}”?` : ""}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={effective === "permanent" ? "danger" : "primary"}
            onClick={() => {
              if (book) onConfirm(book, effective);
              setMode("library");
            }}
          >
            {effective === "permanent" ? "Delete permanently" : "Remove"}
          </Button>
        </>
      }
    >
      {permanentOnly ? (
        <p>{options[1].description}</p>
      ) : (
        <div className="flex flex-col gap-2" role="radiogroup">
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors",
                mode === option.value
                  ? "border-accent bg-surface-2"
                  : "border-border hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="remove-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-text">{option.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </Dialog>
  );
}
