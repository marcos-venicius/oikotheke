import type {
  PageViewport,
  PDFDocumentProxy,
  PDFPageProxy,
  TextContent,
} from "@/services/pdfService";
import type { TextRun } from "./pdfSearch";
import { CSS_UNITS, type Size } from "./readerMath";

/** Canvas pixel budget per page; very high zoom levels drop device-pixel density instead. */
const MAX_CANVAS_PIXELS = 16_777_216;

interface Entry {
  page: number;
  canvas: HTMLCanvasElement;
}

interface Job {
  page: number;
  promise: Promise<HTMLCanvasElement>;
  cancel: () => void;
}

/** The text items of a page, one per span of its text layer (pdf.js skips the others). */
export function textRuns(content: TextContent): TextRun[] {
  return content.items.flatMap((item) =>
    "str" in item ? [{ str: item.str, hasEOL: item.hasEOL }] : [],
  );
}

function keyOf(page: number, zoom: number): string {
  return `${page}@${zoom.toFixed(4)}`;
}

/**
 * Renders pages of one open document on demand and keeps only a small window of them.
 * Pages outside the window are released (`cleanup`) and their canvases freed, so memory
 * stays flat no matter how large the document is.
 */
export class PageRenderer {
  private readonly pages = new Map<number, Promise<PDFPageProxy>>();
  private readonly canvases = new Map<string, Entry>();
  private readonly jobs = new Map<string, Job>();
  private readonly texts = new Map<number, Promise<TextContent>>();
  private destroyed = false;

  constructor(
    private readonly doc: PDFDocumentProxy,
    private readonly maxCanvases = 8,
  ) {}

  get pageCount(): number {
    return this.doc.numPages;
  }

  private page(n: number): Promise<PDFPageProxy> {
    let page = this.pages.get(n);
    if (!page) {
      page = this.doc.getPage(n);
      this.pages.set(n, page);
      page.catch(() => this.pages.delete(n));
    }
    return page;
  }

  /** Page size in PDF points (rotation applied). */
  async pageSize(n: number): Promise<Size> {
    const viewport = (await this.page(n)).getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  /** The viewport `render` uses for page `n` at `zoom`. */
  async viewport(n: number, zoom: number): Promise<PageViewport> {
    return (await this.page(n)).getViewport({ scale: zoom * CSS_UNITS });
  }

  /** Text of a page in the window (for the text layer), kept until the page leaves it. */
  textContent(n: number): Promise<TextContent> {
    let text = this.texts.get(n);
    if (!text) {
      text = this.page(n).then((page) => page.getTextContent());
      this.texts.set(n, text);
      text.catch(() => this.texts.delete(n));
    }
    return text;
  }

  /** Text runs of any page, for searching; nothing is kept. */
  async textRuns(n: number): Promise<TextRun[]> {
    const page = await (this.pages.get(n) ?? this.doc.getPage(n));
    return textRuns(await page.getTextContent());
  }

  /** Returns a canvas for page `n` at `zoom` (1 = 100%), reusing cached renders. */
  render(n: number, zoom: number): Promise<HTMLCanvasElement> {
    const key = keyOf(n, zoom);
    const cached = this.canvases.get(key);
    if (cached) {
      // Refresh LRU position.
      this.canvases.delete(key);
      this.canvases.set(key, cached);
      return Promise.resolve(cached.canvas);
    }
    const running = this.jobs.get(key);
    if (running) return running.promise;

    let cancelRender = () => {};
    let cancelled = false;
    const promise = (async () => {
      const page = await this.page(n);
      if (cancelled || this.destroyed) throw new Error("cancelled");
      const viewport = page.getViewport({ scale: zoom * CSS_UNITS });
      const cssPixels = viewport.width * viewport.height;
      const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / cssPixels));
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      // Exact CSS size, so fitted pages meet the window edges without a gap.
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const task = page.render({
        canvas,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      cancelRender = () => task.cancel();
      await task.promise;
      return canvas;
    })();

    const job: Job = {
      page: n,
      promise,
      cancel: () => {
        cancelled = true;
        cancelRender();
      },
    };
    this.jobs.set(key, job);
    promise
      .then((canvas) => {
        if (this.jobs.get(key) !== job) return;
        this.canvases.set(key, { page: n, canvas });
        this.evictOverflow();
      })
      .catch(() => {})
      .finally(() => {
        if (this.jobs.get(key) === job) this.jobs.delete(key);
      });
    return promise;
  }

  /**
   * Keeps only `window` pages at `zoom`: cancels other renders, frees other canvases and
   * releases page resources outside the window.
   */
  retain(window: number[], zoom: number): void {
    const keep = new Set(window.map((p) => keyOf(p, zoom)));
    const keepPages = new Set(window);
    for (const [key, job] of this.jobs) {
      if (!keep.has(key)) {
        job.cancel();
        this.jobs.delete(key);
      }
    }
    for (const [key, entry] of this.canvases) {
      if (!keep.has(key)) {
        this.free(entry.canvas);
        this.canvases.delete(key);
      }
    }
    for (const n of this.texts.keys()) {
      if (!keepPages.has(n)) this.texts.delete(n);
    }
    for (const [n, page] of this.pages) {
      if (!keepPages.has(n)) {
        this.pages.delete(n);
        void page.then((p) => p.cleanup()).catch(() => {});
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.retain([], 0);
  }

  private evictOverflow(): void {
    while (this.canvases.size > this.maxCanvases) {
      const [oldestKey, oldest] = this.canvases.entries().next().value as [string, Entry];
      this.free(oldest.canvas);
      this.canvases.delete(oldestKey);
    }
  }

  private free(canvas: HTMLCanvasElement): void {
    // Only free canvases that aren't on screen; the view swaps them out first.
    if (!canvas.isConnected) canvas.width = canvas.height = 0;
  }
}
