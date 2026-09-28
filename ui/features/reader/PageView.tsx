import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ZoomMode } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { PageRenderer } from "./pageRenderer";
import { fitZoom, renderWindow, type Size } from "./readerMath";

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
}

export function PageView({
  renderer,
  page,
  zoomMode,
  customZoom,
  onZoomResolved,
  onFlip,
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

  // Book-like wheel navigation: flip when the page can't scroll further that way.
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.deltaY === 0) return;
    const el = e.currentTarget;
    const dir = e.deltaY > 0 ? 1 : -1;
    const atEdge =
      dir > 0 ? el.scrollTop + el.clientHeight >= el.scrollHeight - 1 : el.scrollTop <= 0;
    const state = flipState.current;
    if (!atEdge) {
      state.delta = 0;
      return;
    }
    state.delta += e.deltaY;
    const now = performance.now();
    if (Math.abs(state.delta) >= WHEEL_THRESHOLD && now - state.last > FLIP_COOLDOWN) {
      state.delta = 0;
      state.last = now;
      state.arriveAtBottom = dir < 0;
      onFlip(dir);
    }
  };

  return (
    <div
      ref={scrollRef}
      onWheel={onWheel}
      className={cn(
        "scrollbar-thin relative h-full overflow-auto bg-reader",
        // Fitted pages never need vertical scrolling; this also absorbs sub-pixel rounding.
        (zoomMode === "fit-page" || zoomMode === "fit-height") && "overflow-y-hidden",
      )}
      style={{ padding: `${padY}px ${padX}px` }}
    >
      <div className="flex min-h-full min-w-fit items-center justify-center">
        <div
          ref={slotRef}
          className={cn(
            "bg-white shadow-lift transition-opacity duration-150 [&>canvas]:block",
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
