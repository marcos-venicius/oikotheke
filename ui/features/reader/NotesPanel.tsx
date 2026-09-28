import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import type { Note } from "@/lib/types";
import type { NoteGroup } from "@/lib/notes";
import { debounce } from "@/lib/debounce";
import { formatRelative, plural } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/Button";
import type { BookNotes } from "./useBookNotes";

type Tab = "here" | "all";

/** The place being read: a PDF page, or the visible part of an EPUB. */
export interface NotesHere {
  /** Identifies the place; a draft belongs to the place it was started on. */
  key: string;
  /** Tab title, e.g. "Page 30" or "This page". */
  label: string;
  notes: Note[];
  /** Creates a note here. */
  create: (content: string) => Promise<unknown>;
}

/** A neighbouring annotated place. */
export interface NotesJump {
  label: string;
  go: () => void;
}

interface NotesPanelProps {
  notes: BookNotes;
  here: NotesHere;
  prev: NotesJump | null;
  next: NotesJump | null;
  /** Every note of the book, grouped in reading order. */
  groups: NoteGroup[];
  /** Key of the group being read, highlighted in "All notes". */
  currentGroup?: string;
  onOpenGroup: (group: NoteGroup) => void;
  onClose: () => void;
}

/** Notes side panel shared by the readers; each reader decides what "here" means. */
export function NotesPanel(props: NotesPanelProps) {
  const { notes, here, prev, next } = props;
  const [tab, setTab] = useState<Tab>("here");
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const drafting = draftKey === here.key;

  return (
    <aside
      aria-label="Notes"
      className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-surface"
    >
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-3">
        <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs font-medium" role="tablist">
          {(["here", "all"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-2.5 py-1.5 transition-colors",
                tab === t ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text",
              )}
            >
              {t === "here" ? here.label : `All notes · ${notes.notes.length}`}
            </button>
          ))}
        </div>
        <IconButton label="Close notes (N)" onClick={props.onClose} className="ml-auto">
          <X className="size-4" />
        </IconButton>
      </div>

      {tab === "here" ? (
        <>
          <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
            {here.notes.map((note) => (
              <NoteEditor
                key={note.id}
                note={note}
                onSave={(content) => notes.update(note.id, content)}
                onDelete={() => notes.remove(note.id)}
              />
            ))}
            {drafting && (
              <NoteEditor
                autoFocus
                onSave={async (content) => {
                  await here.create(content);
                  setDraftKey(null);
                }}
                onDiscard={() => setDraftKey(null)}
              />
            )}
            {here.notes.length === 0 && !drafting && (
              <p className="px-1 pt-2 text-sm text-muted">No notes on this page yet.</p>
            )}
            {!drafting && (
              <Button
                variant="ghost"
                className="justify-start text-muted"
                onClick={() => setDraftKey(here.key)}
              >
                <Plus className="size-4" /> Add note
              </Button>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-2 py-2 text-xs text-muted">
            <Button
              variant="ghost"
              className="h-8 max-w-[42%] min-w-0 px-2 text-xs"
              disabled={prev === null}
              onClick={prev?.go}
              title={prev?.label}
            >
              <ChevronLeft className="size-3.5 shrink-0" />
              <span className="truncate">{prev?.label ?? "Previous"}</span>
            </Button>
            <span className="shrink-0">Notes</span>
            <Button
              variant="ghost"
              className="h-8 max-w-[42%] min-w-0 px-2 text-xs"
              disabled={next === null}
              onClick={next?.go}
              title={next?.label}
            >
              <span className="truncate">{next?.label ?? "Next"}</span>
              <ChevronRight className="size-3.5 shrink-0" />
            </Button>
          </div>
        </>
      ) : (
        <AllNotes
          groups={props.groups}
          current={props.currentGroup}
          onOpen={(group) => {
            props.onOpenGroup(group);
            setTab("here");
          }}
        />
      )}
    </aside>
  );
}

function AllNotes({
  groups,
  current,
  onOpen,
}: {
  groups: NoteGroup[];
  current?: string;
  onOpen: (group: NoteGroup) => void;
}) {
  if (groups.length === 0) {
    return <p className="p-4 text-sm text-muted">Notes you add will show up here.</p>;
  }
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          onClick={() => onOpen(group)}
          className={cn(
            "block w-full rounded-lg p-2.5 text-left transition-colors hover:bg-surface-2",
            group.key === current && "bg-surface-2",
          )}
        >
          <span className="text-xs font-medium text-accent">
            {group.label}
            {group.notes.length > 1 && (
              <span className="text-muted"> · {plural(group.notes.length, "note")}</span>
            )}
          </span>
          {group.notes.map((note) => (
            <span key={note.id} className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap">
              {note.content}
            </span>
          ))}
        </button>
      ))}
    </div>
  );
}

const SAVE_DELAY = 600;

/** Debounced save that skips empty and unchanged content. The handler can be swapped per render. */
function createAutosaver(initial: string, save: (content: string) => Promise<unknown>) {
  const saver = {
    save,
    lastSaved: initial,
    setHandler(next: (content: string) => Promise<unknown>) {
      saver.save = next;
    },
    schedule: debounce((value: string) => {
      const content = value.trim();
      if (!content || content === saver.lastSaved) return;
      saver.lastSaved = content;
      saver.save(content).catch(() => {
        saver.lastSaved = "";
      });
    }, SAVE_DELAY),
  };
  return saver;
}

interface NoteEditorProps {
  note?: Note;
  autoFocus?: boolean;
  onSave: (content: string) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onDiscard?: () => void;
}

/** Auto-saving note editor. Existing notes save while typing; drafts are created on blur. */
function NoteEditor({ note, autoFocus, onSave, onDelete, onDiscard }: NoteEditorProps) {
  const [text, setText] = useState(note?.content ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [autosave] = useState(() => createAutosaver(note?.content ?? "", onSave));
  useLayoutEffect(() => {
    autosave.setHandler(onSave);
  });

  // Save any pending edit when the editor goes away (page change, panel closed).
  useEffect(() => () => autosave.schedule.flush(), [autosave]);

  // Grow with the content.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const finishDraft = () => {
    if (text.trim()) void onSave(text.trim()).catch(() => {});
    else onDiscard?.();
  };

  return (
    <div className="group rounded-xl border border-border bg-bg p-3 focus-within:border-accent">
      <textarea
        ref={ref}
        autoFocus={autoFocus}
        value={text}
        rows={2}
        placeholder="Write a note…"
        aria-label={note ? "Note" : "New note"}
        onChange={(e) => {
          setText(e.target.value);
          if (note) autosave.schedule(e.target.value);
        }}
        onBlur={() => (note ? autosave.schedule.flush() : finishDraft())}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            if (!note && !text.trim()) onDiscard?.();
            else e.currentTarget.blur();
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.currentTarget.blur();
          }
        }}
        className="block w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted"
      />
      {note && (
        <div className="mt-2 flex h-6 items-center justify-between text-[11px] text-muted">
          <span>
            {note.updatedAt > note.createdAt ? "Edited" : "Added"} {formatRelative(note.updatedAt)}
          </span>
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void onDelete?.().catch(() => setConfirmDelete(false))}
                className="rounded px-1.5 py-0.5 font-medium text-danger hover:bg-surface-2"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded px-1.5 py-0.5 hover:bg-surface-2"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label="Delete note"
              onClick={() => setConfirmDelete(true)}
              className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-surface-2 hover:text-danger focus-visible:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
