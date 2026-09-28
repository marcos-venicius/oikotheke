import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Book, BookMetadata } from "@/lib/types";
import { canvasToJpeg, COVER_WIDTH } from "./coverImage";
import { pickAuthor, pickTitle } from "./pdfTitle";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type PDFDocumentProxy = pdfjs.PDFDocumentProxy;
export type PDFPageProxy = pdfjs.PDFPageProxy;
export type PDFLoadingTask = pdfjs.PDFDocumentLoadingTask;

const SCHEME = "oikotheke";
/**
 * pdf.js fetches the file in chunks of this size, only where it needs data. Kept small because
 * opening a document walks the page tree (`checkLastPage`), touching one chunk per page object.
 */
const RANGE_CHUNK = 64 * 1024;
/** Must stay below the backend's per-response cap (16 MB). */
const MAX_FETCH = 8 * 1024 * 1024;
const ASSETS = new URL("/pdfjs/", window.location.href).href;

export function bookUrl(id: string): string {
  return convertFileSrc(`book/${id}`, SCHEME);
}

export function coverUrl(book: Book): string | null {
  if (!book.coverPath) return null;
  return `${convertFileSrc(`cover/${book.id}`, SCHEME)}?v=${book.updatedAt}`;
}

/** Fetches bytes [begin, end) with HTTP Range requests, splitting large ranges. */
async function fetchRange(url: string, begin: number, end: number): Promise<Uint8Array> {
  const out = new Uint8Array(end - begin);
  let offset = begin;
  while (offset < end) {
    const last = Math.min(end, offset + MAX_FETCH) - 1;
    const res = await fetch(url, { headers: { Range: `bytes=${offset}-${last}` } });
    if (res.status !== 206 && res.status !== 200)
      throw new Error(`Range request failed: ${res.status}`);
    const chunk = new Uint8Array(await res.arrayBuffer());
    if (chunk.length === 0) throw new Error("Empty range response");
    out.set(chunk.subarray(0, end - offset), offset - begin);
    offset += chunk.length;
  }
  return out;
}

/**
 * Feeds pdf.js through explicit byte ranges instead of downloading the whole file,
 * so opening a large book only reads the xref and the pages being displayed.
 */
class RangeTransport extends pdfjs.PDFDataRangeTransport {
  constructor(
    private readonly url: string,
    length: number,
  ) {
    super(length, null);
  }

  override requestDataRange(begin: number, end: number): void {
    const attempt = (retries: number): Promise<void> =>
      fetchRange(this.url, begin, end)
        .then((chunk) => this.onDataRange(begin, chunk))
        .catch((error) => {
          if (retries > 0) return attempt(retries - 1);
          console.error("pdf range request failed", begin, end, error);
        });
    void attempt(2);
  }
}

/** Opens a managed book. Call `destroy()` on the task when done. */
export function openDocument(book: Pick<Book, "id" | "fileSize">): PDFLoadingTask {
  return pdfjs.getDocument({
    range: new RangeTransport(bookUrl(book.id), book.fileSize),
    rangeChunkSize: RANGE_CHUNK,
    disableAutoFetch: true,
    disableStream: true,
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  });
}

export async function readMetadata(
  doc: PDFDocumentProxy,
  fallbackTitle: string,
): Promise<BookMetadata> {
  const { info } = await doc.getMetadata().catch(() => ({ info: {} }));
  const fields = info as Record<string, unknown>;
  return {
    title: pickTitle(fields.Title, fallbackTitle),
    author: pickAuthor(fields.Author),
    pageCount: doc.numPages,
  };
}

/** Renders page 1 into a JPEG thumbnail. */
export async function renderCover(doc: PDFDocumentProxy): Promise<Uint8Array> {
  const page = await doc.getPage(1);
  try {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return await canvasToJpeg(canvas);
  } finally {
    page.cleanup();
  }
}
