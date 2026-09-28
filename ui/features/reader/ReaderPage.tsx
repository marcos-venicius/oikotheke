import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Book, ZoomMode } from "@/lib/types";
import { Button } from "@/components/Button";
import { progressService } from "@/services/progressService";
import { NotesPanel } from "./NotesPanel";
import { PageScrubber } from "./PageScrubber";
import { PageView } from "./PageView";
import { ReaderToolbar } from "./ReaderToolbar";
import type { PageRenderer } from "./pageRenderer";
import { clampPage, stepZoom } from "./readerMath";
import { useBookNotes } from "./useBookNotes";
import { useReaderDocument } from "./useReaderDocument";

const CHROME_IDLE_MS = 2500;

export function ReaderPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const state = useReaderDocument(id);

  if (state.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-reader">
        <span className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm font-medium">This book can't be opened</p>
        <p className="max-w-sm text-sm text-muted">{state.message}</p>
        <Button onClick={() => navigate("/")}>Back to library</Button>
      </div>
    );
  }
  return <Reader key={state.book.id} book={state.book} renderer={state.renderer} />;
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(target.tagName))
  );
}

function Reader({ book, renderer }: { book: Book; renderer: PageRenderer }) {
  const navigate = useNavigate();
  // Callers may open the reader at a specific page (e.g. a note in book details).
  const requestedPage = (useLocation().state as { page?: number } | null)?.page;
  const pageCount = renderer.pageCount;
  const [page, setPage] = useState(() => clampPage(requestedPage ?? book.currentPage, pageCount));
  const [zoomMode, setZoomMode] = useState<ZoomMode>(book.zoomMode ?? "fit-page");
  const [customZoom, setCustomZoom] = useState(book.zoomLevel ?? 1);
  const [resolvedZoom, setResolvedZoom] = useState(customZoom);
  const [notesOpen, setNotesOpen] = useState(false);
  const notes = useBookNotes(book.id);
  const chrome = useChromeVisibility();
  // While annotating, keep the toolbar in place above the notes panel.
  const chromeVisible = chrome.visible || notesOpen;

  // Autosave: debounced while reading, flushed when leaving or closing the window.
  const saver = useMemo(() => progressService.createSaver(book.id), [book.id]);
  useEffect(() => {
    saver.schedule({
      currentPage: page,
      zoomMode,
      zoomLevel: zoomMode === "custom" ? customZoom : null,
    });
  }, [saver, page, zoomMode, customZoom]);
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested(() => saver.flush());
    return () => {
      void saver.flush();
      void unlisten.then((fn) => fn());
    };
  }, [saver]);

  const goTo = useCallback((target: number) => setPage(clampPage(target, pageCount)), [pageCount]);
  const flip = useCallback(
    (dir: 1 | -1) => setPage((p) => clampPage(p + dir, pageCount)),
    [pageCount],
  );
  const zoom = useCallback(
    (dir: 1 | -1) => {
      setCustomZoom(stepZoom(resolvedZoom, dir));
      setZoomMode("custom");
    },
    [resolvedZoom],
  );
  const back = useCallback(() => navigate("/"), [navigate]);

  const handlers = useRef({ flip, goTo, zoom, back });
  useLayoutEffect(() => {
    handlers.current = { flip, goTo, zoom, back };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey || e.metaKey) return;
      const h = handlers.current;
      const withCtrl = e.ctrlKey;
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          h.flip(1);
          break;
        case "ArrowLeft":
        case "PageUp":
          h.flip(-1);
          break;
        case "Home":
          h.goTo(1);
          break;
        case "End":
          h.goTo(Number.MAX_SAFE_INTEGER);
          break;
        case "+":
        case "=":
          h.zoom(1);
          break;
        case "-":
          h.zoom(-1);
          break;
        case "0":
          setZoomMode("fit-page");
          break;
        case "w":
        case "W":
          if (withCtrl) return;
          setZoomMode("fit-width");
          break;
        case "n":
        case "N":
          if (withCtrl) return;
          setNotesOpen((open) => !open);
          break;
        case "Escape":
          h.back();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-full overflow-hidden bg-reader" onPointerMove={chrome.poke}>
      <ReaderToolbar
        title={book.title}
        page={page}
        pageCount={pageCount}
        zoom={resolvedZoom}
        zoomMode={zoomMode}
        visible={chromeVisible}
        onBack={back}
        onGoTo={goTo}
        onZoom={zoom}
        onZoomMode={setZoomMode}
        notesOpen={notesOpen}
        pageHasNotes={notes.pages.includes(page)}
        onToggleNotes={() => setNotesOpen((open) => !open)}
      />
      <div className="flex h-full">
        <main className="relative min-w-0 flex-1" onPointerEnter={chrome.poke}>
          <PageView
            renderer={renderer}
            page={page}
            zoomMode={zoomMode}
            customZoom={customZoom}
            onZoomResolved={setResolvedZoom}
            onFlip={flip}
          />
          <PageScrubber
            page={page}
            pageCount={pageCount}
            markedPages={notes.pages}
            visible={chromeVisible}
            onGoTo={goTo}
          />
        </main>
        {notesOpen && (
          <div className="pt-14">
            <NotesPanel
              page={page}
              notes={notes}
              onGoTo={goTo}
              onClose={() => setNotesOpen(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Toolbar and scrubber fade out after a moment without pointer movement. */
function useChromeVisibility() {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const scheduleHide = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Keep the chrome while the user is typing in it (e.g. the page input).
      if (!isTyping(document.activeElement)) setVisible(false);
    }, CHROME_IDLE_MS);
  }, []);

  const poke = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => clearTimeout(timer.current);
  }, [scheduleHide]);

  return { visible, poke };
}
