import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { RelocateDetail, View } from "foliate-js/view.js";
import type { Book } from "@/lib/types";
import { useTheme } from "@/app/theme";
import { toast } from "@/components/toast";
import { openEpub } from "@/services/epubService";
import { describeError } from "@/services/ipc";
import { linkService, webUrl } from "@/services/linkService";
import { contentCss, stepFontSize, type EpubFlow } from "./epubStyles";
import { EpubToolbar } from "./EpubToolbar";
import { FractionScrubber } from "./FractionScrubber";
import { OpenLinkDialog } from "./OpenLinkDialog";
import { ignoresShortcuts, useChromeVisibility } from "./readerChrome";
import { ReaderError, ReaderLoading } from "./ReaderStatus";
import { TocPanel } from "./TocPanel";
import { useEpubPrefs } from "./useEpubPrefs";
import { useFocusMode } from "./useFocusMode";
import { useProgressSaver } from "./useProgressSaver";

/** Readable line length and page gutters for reflowable text. */
const LAYOUT = { "max-inline-size": "720px", gap: "7%", margin: "56px" };

interface Position {
  fraction: number;
  chapter?: string;
}

/** EPUB reading: foliate-js lays out the book in iframes; positions are CFIs. */
export function EpubReader({ book }: { book: Book }) {
  const navigate = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>({ fraction: book.progress });
  const [tocOpen, setTocOpen] = useState(false);
  const [pendingLink, setPendingLink] = useState<URL | null>(null);
  const { prefs, update } = useEpubPrefs();
  const { resolved: theme } = useTheme();
  const chrome = useChromeVisibility();
  const { focus, setFocusMode } = useFocusMode();
  const saver = useProgressSaver(book.id);
  const prefsLoaded = prefs !== null;

  const onRelocate = useCallback(
    ({ fraction, cfi, tocItem }: RelocateDetail) => {
      const progress = Math.min(1, Math.max(0, fraction ?? 0));
      setPosition({ fraction: progress, chapter: tocItem?.label?.trim() });
      if (cfi) saver.schedule({ location: cfi, progress, zoomMode: null, zoomLevel: null });
    },
    [saver],
  );

  const flip = useCallback(
    (dir: 1 | -1) => void (dir > 0 ? view?.goRight() : view?.goLeft()),
    [view],
  );
  const changeFontSize = useCallback(
    (dir: 1 | -1) => prefs && update({ fontSize: stepFontSize(prefs.fontSize, dir) }),
    [prefs, update],
  );
  const back = useCallback(() => navigate("/"), [navigate]);
  const toggleFocus = useCallback(() => setFocusMode(!focus), [focus, setFocusMode]);
  // Esc closes the contents, then leaves focus mode, then the reader.
  const escape = useCallback(() => {
    if (tocOpen) setTocOpen(false);
    else if (focus) setFocusMode(false);
    else back();
  }, [tocOpen, focus, setFocusMode, back]);

  // Event listeners are attached once (including inside the book's iframes) and read the latest
  // handlers from this ref.
  const handlers = useRef({
    onRelocate,
    flip,
    changeFontSize,
    escape,
    toggleFocus,
    poke: chrome.poke,
  });
  useLayoutEffect(() => {
    handlers.current = { onRelocate, flip, changeFontSize, escape, toggleFocus, poke: chrome.poke };
  });

  const onKey = useCallback((e: KeyboardEvent) => {
    if (ignoresShortcuts(e.target) || e.altKey || e.metaKey || e.ctrlKey) return;
    const h = handlers.current;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
        h.flip(1);
        break;
      case "ArrowLeft":
      case "PageUp":
        h.flip(-1);
        break;
      case "+":
      case "=":
        h.changeFontSize(1);
        break;
      case "-":
        h.changeFontSize(-1);
        break;
      case "t":
      case "T":
        setTocOpen((open) => !open);
        break;
      case "f":
      case "F":
      case "F11":
        h.toggleFocus();
        break;
      case "Escape":
        h.escape();
        break;
      default:
        return;
    }
    e.preventDefault();
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  // Open the book once, after the preferences are known so the first layout is final.
  useEffect(() => {
    if (!prefsLoaded) return;
    let active = true;
    let opened: View | null = null;
    (async () => {
      try {
        await import("foliate-js/view.js"); // registers <foliate-view>
        const epub = await openEpub(book);
        if (!active || !host.current) return;
        const el = document.createElement("foliate-view") as View;
        el.style.display = "block";
        el.style.height = "100%";
        opened = el;
        host.current.append(el);
        el.addEventListener("relocate", (e) =>
          handlers.current.onRelocate((e as CustomEvent<RelocateDetail>).detail),
        );
        // Keys and pointer moves inside the book's iframes never reach the window.
        el.addEventListener("load", (e) => {
          const { doc } = (e as CustomEvent<{ doc: Document }>).detail;
          doc.addEventListener("keydown", onKey);
          doc.addEventListener("pointermove", () => handlers.current.poke());
        });
        // Links to websites open in the system browser, and only after the user confirms.
        // Cancelling the event stops foliate-js from calling window.open itself.
        el.addEventListener("external-link", (e) => {
          e.preventDefault();
          const href = (e as CustomEvent<{ href: string }>).detail.href;
          const url = webUrl(href);
          if (url) setPendingLink(url);
          else toast("This link can't be opened", { description: href });
        });
        await el.open(epub);
        for (const [name, value] of Object.entries(LAYOUT)) el.renderer.setAttribute(name, value);
        if (active) setView(el);
        await el.init({ lastLocation: book.location });
      } catch (err) {
        console.error("failed to open EPUB", err);
        if (active) setError("This EPUB is damaged or can't be displayed.");
      }
    })();
    return () => {
      active = false;
      opened?.close();
      opened?.remove();
    };
  }, [book, prefsLoaded, onKey]);

  // Styles and layout follow the preferences and the app theme. The theme's colors are read a
  // frame later: ThemeProvider applies them in its own effect, which runs after this one.
  useEffect(() => {
    if (!view || !prefs) return;
    view.renderer.setAttribute("flow", prefs.flow);
    const frame = requestAnimationFrame(() => {
      const css = getComputedStyle(document.documentElement);
      const token = (name: string) => css.getPropertyValue(name).trim();
      view.renderer.setStyles(
        contentCss(prefs.fontSize, {
          dark: theme === "dark",
          text: token("--text"),
          accent: token("--accent"),
          background: token("--bg"),
        }),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [view, prefs, theme]);

  if (error) return <ReaderError message={error} />;

  const toc = view?.book.toc ?? [];
  return (
    <div className="relative h-full overflow-hidden bg-bg" onPointerMove={chrome.poke}>
      {prefs && (
        <EpubToolbar
          title={book.title}
          visible={chrome.visible || tocOpen}
          fontSize={prefs.fontSize}
          flow={prefs.flow}
          focusMode={focus}
          tocOpen={tocOpen}
          hasToc={toc.length > 0}
          onBack={back}
          onPrev={() => flip(-1)}
          onNext={() => flip(1)}
          onFontSize={changeFontSize}
          onFlow={(flow: EpubFlow) => update({ flow })}
          onToggleToc={() => setTocOpen((open) => !open)}
          onToggleFocus={toggleFocus}
        />
      )}
      <div className="flex h-full">
        {tocOpen && toc.length > 0 && (
          <div className="pt-14">
            <TocPanel
              toc={toc}
              current={position.chapter}
              onGoTo={(href) => void view?.goTo(href)}
              onClose={() => setTocOpen(false)}
            />
          </div>
        )}
        <main className="relative min-w-0 flex-1 pt-14 pb-12" onPointerEnter={chrome.poke}>
          <div ref={host} className="h-full" />
          {!view && (
            <div className="absolute inset-0">
              <ReaderLoading />
            </div>
          )}
        </main>
      </div>
      <OpenLinkDialog
        url={pendingLink}
        onCancel={() => setPendingLink(null)}
        onConfirm={(url) => {
          setPendingLink(null);
          linkService
            .openInBrowser(url)
            .catch((err) =>
              toast("Could not open the link", { tone: "error", description: describeError(err) }),
            );
        }}
      />
      <FractionScrubber
        fraction={position.fraction}
        label={position.chapter}
        visible={chrome.visible || tocOpen}
        onGoTo={(fraction) => void view?.goToFraction(fraction)}
      />
    </div>
  );
}
