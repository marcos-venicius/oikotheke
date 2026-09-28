import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Book, ZoomMode } from "@/lib/types";
import { pdfLocation, pdfPage, pdfProgress } from "@/lib/location";
import { NotesPanel } from "./NotesPanel";
import { isTyping, useChromeVisibility } from "./readerChrome";
import { ReaderError, ReaderLoading } from "./ReaderStatus";
import { PageScrubber } from "./PageScrubber";
import { PageView } from "./PageView";
import { ReaderToolbar } from "./ReaderToolbar";
import type { PageRenderer } from "./pageRenderer";
import { clampPage, stepZoom } from "./readerMath";
import { useBookNotes } from "./useBookNotes";
import { useFocusMode } from "./useFocusMode";
import { useProgressSaver } from "./useProgressSaver";
import { useReaderDocument } from "./useReaderDocument";

/** PDF reading: pdf.js renders one page at a time (see `pageRenderer.ts`). */
export function PdfReader({ book }: { book: Book }) {
  const state = useReaderDocument(book);
  if (state.status === "loading") return <ReaderLoading />;
  if (state.status === "error") return <ReaderError message={state.message} />;
  return <Reader book={book} renderer={state.renderer} />;
}

function Reader({ book, renderer }: { book: Book; renderer: PageRenderer }) {
  const navigate = useNavigate();
  // Callers may open the reader at a specific page (e.g. a note in book details).
  const requestedPage = (useLocation().state as { page?: number } | null)?.page;
  const pageCount = renderer.pageCount;
  const [page, setPage] = useState(() =>
    clampPage(requestedPage ?? pdfPage(book.location) ?? 1, pageCount),
  );
  const [zoomMode, setZoomMode] = useState<ZoomMode>(book.zoomMode ?? "fit-page");
  const [customZoom, setCustomZoom] = useState(book.zoomLevel ?? 1);
  const [resolvedZoom, setResolvedZoom] = useState(customZoom);
  const [notesOpen, setNotesOpen] = useState(false);
  const notes = useBookNotes(book.id);
  const chrome = useChromeVisibility();
  const { focus, setFocusMode } = useFocusMode();
  // While annotating, keep the toolbar in place above the notes panel.
  const chromeVisible = chrome.visible || notesOpen;

  const saver = useProgressSaver(book.id);
  useEffect(() => {
    saver.schedule({
      location: pdfLocation(page),
      progress: pdfProgress(page, pageCount),
      zoomMode,
      zoomLevel: zoomMode === "custom" ? customZoom : null,
    });
  }, [saver, page, pageCount, zoomMode, customZoom]);
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
  const toggleFocus = useCallback(() => setFocusMode(!focus), [focus, setFocusMode]);
  // Esc leaves focus mode first, then the reader.
  const escape = useCallback(
    () => (focus ? setFocusMode(false) : back()),
    [focus, setFocusMode, back],
  );

  const handlers = useRef({ flip, goTo, zoom, escape, toggleFocus });
  useLayoutEffect(() => {
    handlers.current = { flip, goTo, zoom, escape, toggleFocus };
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
        case "h":
        case "H":
          if (withCtrl) return;
          setZoomMode("fit-height");
          break;
        case "f":
        case "F":
          if (withCtrl) return;
          h.toggleFocus();
          break;
        case "F11":
          h.toggleFocus();
          break;
        case "n":
        case "N":
          if (withCtrl) return;
          setNotesOpen((open) => !open);
          break;
        case "Escape":
          h.escape();
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
        focusMode={focus}
        onToggleFocus={toggleFocus}
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
