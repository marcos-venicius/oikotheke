import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ZoomMode } from "@/lib/types";
import { cn } from "@/lib/cn";
import { TextLayer } from "@/services/pdfService";
import { textRuns, type PageRenderer } from "./pageRenderer";
import { findMatches, indexPage, type TextMatch } from "./pdfSearch";
import { fitZoom, renderWindow, type Size } from "./readerMath";
import { bindTextSelection } from "./textSelection";

/** Space around the page. Fit height uses none vertically: the page spans the full window height. */
const PADDING = 32;
const WHEEL_THRESHOLD = 60;
const FLIP_COOLDOWN = 350;

interface PageViewProps {
  renderer: PageRenderer;
  page: number;
  zoomMode: ZoomMode;
  customZoom: number;
  /** Reports the zoom actually used (fit modes resolve to a number). */
  onZoomResolved: (zoom: number) => void;
  onFlip: (direction: 1 | -1) => void;
  /** Search hits to highlight: a folded query and which of the page's matches is current. */
  search?: { query: string; current: number | null } | null;
}

/** The text layer shown over the current page. */
interface ShownText {
  key: string;
  spans: HTMLElement[];
  runs: ReturnType<typeof textRuns>;
}

export function PageView({
  renderer,
  page,
  zoomMode,
  customZoom,
  onZoomResolved,
  onFlip,
  search,
}: PageViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  // Outer size of the scroll area (padding included). The padding depends on the zoom mode and
  // WebKitGTK doesn't report padding-only changes to ResizeObserver, so it's subtracted here.
  const [outer, setOuter] = useState<Size>({ width: 0, height: 0 });
  const padX = PADDING;
  const padY = zoomMode === "fit-height" ? 0 : PADDING;
  const box: Size = {
    width: Math.max(0, outer.width - padX * 2),
    height: Math.max(0, outer.height - padY * 2),
  };
  const [pageSize, setPageSize] = useState<{ page: number; size: Size } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const flipState = useRef({ delta: 0, last: 0, arriveAtBottom: false });
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [text, setText] = useState<ShownText | null>(null);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      // clientWidth/Height include padding and exclude scrollbars.
      setOuter({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    renderer
      .pageSize(page)
      .then((size) => active && setPageSize({ page, size }))
      .catch(() => active && setFailedKey(`${page}`));
    return () => {
      active = false;
    };
  }, [renderer, page]);

  const size = pageSize?.page === page ? pageSize.size : null;
  const zoom =
    zoomMode === "custom"
      ? customZoom
      : size && box.width > 0
        ? fitZoom(size, box, zoomMode)
        : null;

  const renderKey = `${page}@${zoom}`;
  const error = failedKey === renderKey || failedKey === `${page}`;

  useEffect(() => {
    if (zoom !== null) onZoomResolved(zoom);
  }, [zoom, onZoomResolved]);

  // Render the current page, then pre-render the window around it.
  useEffect(() => {
    if (zoom === null) return;
    let active = true;
    const window = renderWindow(page, renderer.pageCount);
    renderer.retain(window, zoom);
    const spinner = setTimeout(() => active && setLoading(true), 150);

    renderer
      .render(page, zoom)
      .then(async (canvas) => {
        if (!active) return;
        clearTimeout(spinner);
        setLoading(false);
        slotRef.current?.replaceChildren(canvas);
        setShownKey(`${page}@${zoom}`);
        const scroller = scrollRef.current;
        if (scroller) {
          scroller.scrollTop = flipState.current.arriveAtBottom ? scroller.scrollHeight : 0;
          flipState.current.arriveAtBottom = false;
        }
        for (const next of window.slice(1)) {
          if (!active) return;
          await renderer.render(next, zoom).catch(() => {});
        }
      })
      .catch(() => {
        if (!active) return;
        clearTimeout(spinner);
        setLoading(false);
        setFailedKey(`${page}@${zoom}`);
      });

    return () => {
      active = false;
      clearTimeout(spinner);
    };
  }, [renderer, page, zoom]);

  // Invisible text over the page once its canvas is shown, so text can be selected and copied.
  useEffect(() => {
    const slot = slotRef.current;
    if (zoom === null || shownKey !== renderKey || !slot) return;
    let active = true;
    let layer: TextLayer | null = null;
    let unbind = () => {};
    const div = document.createElement("div");
    div.className = "textLayer";
    Promise.all([renderer.textContent(page), renderer.viewport(page, zoom)])
      .then(async ([content, viewport]) => {
        if (!active) return;
        div.style.setProperty("--total-scale-factor", String(viewport.scale));
        layer = new TextLayer({ textContentSource: content, container: div, viewport });
        await layer.render();
        if (!active) return;
        const end = document.createElement("div");
        end.className = "endOfContent";
        div.append(end);
        slot.append(div);
        unbind = bindTextSelection(div, end);
        setText({ key: renderKey, spans: layer.textDivs, runs: textRuns(content) });
      })
      .catch(() => {});
    return () => {
      active = false;
      layer?.cancel();
      unbind();
      div.remove();
    };
  }, [renderer, page, zoom, renderKey, shownKey]);

  // Highlight search hits on the page and bring the current one into view.
  const shownText = text?.key === renderKey ? text : null;
  const query = search?.query ?? "";
  const current = search?.current ?? null;
  useEffect(() => {
    if (!shownText || !query || typeof CSS === "undefined" || !("highlights" in CSS)) return;
    const matches = findMatches(indexPage(shownText.runs), query);
    const ranges = matches.map((match) => toRange(shownText.spans, match));
    const others = ranges.filter((_, i) => i !== current);
    const active = current !== null ? ranges[current] : undefined;
    CSS.highlights.set("pdf-search", new Highlight(...others));
    if (active) {
      CSS.highlights.set("pdf-search-current", new Highlight(active));
      const box = active.getBoundingClientRect();
      const scroller = scrollRef.current;
      if (scroller) {
        const view = scroller.getBoundingClientRect();
        if (box.top < view.top || box.bottom > view.bottom) {
          scroller.scrollTop += box.top - view.top - view.height / 3;
        }
        if (box.left < view.left || box.right > view.right) {
          scroller.scrollLeft += box.left - view.left - view.width / 3;
        }
      }
    }
    return () => {
      CSS.highlights.delete("pdf-search");
      CSS.highlights.delete("pdf-search-current");
    };
  }, [shownText, query, current]);

  // Shift + wheel flips the page; a plain wheel only scrolls. Native listener: React's is passive.
  const onFlipRef = useRef(onFlip);
  useEffect(() => {
    onFlipRef.current = onFlip;
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || e.ctrlKey) return;
      e.preventDefault();
      // Some engines turn a shift + wheel into horizontal scrolling (deltaX).
      const delta = e.deltaY || e.deltaX;
      if (delta === 0) return;
      const state = flipState.current;
      state.delta += delta;
      const now = performance.now();
      if (Math.abs(state.delta) >= WHEEL_THRESHOLD && now - state.last > FLIP_COOLDOWN) {
        const dir = state.delta > 0 ? 1 : -1;
        state.delta = 0;
        state.last = now;
        state.arriveAtBottom = false;
        onFlipRef.current(dir);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the page focused so ↑/↓ scroll it without clicking: on mount, after a page change and
  // when the window regains focus (unless the user is typing somewhere).
  useEffect(() => {
    const focusPage = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      scrollRef.current?.focus({ preventScroll: true });
    };
    focusPage();
    window.addEventListener("focus", focusPage);
    return () => window.removeEventListener("focus", focusPage);
  }, [page, shownKey]);

  return (
    <div
      ref={scrollRef}
      tabIndex={-1}
      className={cn(
        "scrollbar-thin relative h-full overflow-auto bg-reader outline-none",
        // Fitted pages never need vertical scrolling; this also absorbs sub-pixel rounding.
        (zoomMode === "fit-page" || zoomMode === "fit-height") && "overflow-y-hidden",
      )}
      style={{ padding: `${padY}px ${padX}px` }}
    >
      <div className="flex min-h-full min-w-fit items-center justify-center">
        <div
          ref={slotRef}
          className={cn(
            "relative bg-white shadow-lift transition-opacity duration-150 [&>canvas]:block",
            loading && "opacity-60",
          )}
        />
      </div>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          This page couldn't be displayed.
        </div>
      )}
      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
        </div>
      )}
    </div>
  );
}

function toRange(spans: HTMLElement[], { start, end }: TextMatch): Range {
  const range = document.createRange();
  range.setStart(...textPosition(spans[start.item], start.offset));
  range.setEnd(...textPosition(spans[end.item], end.offset));
  return range;
}

/** A text span holds a single text node (none when its text is empty). */
function textPosition(span: HTMLElement, offset: number): [Node, number] {
  const node = span.firstChild;
  return node ? [node, Math.min(offset, node.textContent?.length ?? 0)] : [span, 0];
}
