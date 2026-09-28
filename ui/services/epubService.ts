import {
  BlobWriter,
  configure,
  Reader,
  TextWriter,
  ZipReader,
  type FileEntry,
} from "@zip.js/zip.js";
import type { FoliateBook, FoliateLoader } from "foliate-js/view.js";
import type { Book, EpubMetadata } from "@/lib/types";
import { bookUrl, fetchRange } from "./bookFile";
import { sanitizeResource } from "./epubSanitize";
import { call } from "./ipc";

// Small entries, read on demand: no need for worker threads.
configure({ useWebWorkers: false });

/** Import-time EPUB metadata comes from the backend; reading uses foliate-js (`openEpub`). */
export const epubService = {
  readMetadata: (bookId: string) => call<EpubMetadata>("read_epub_metadata", { id: bookId }),
  /** The cover image exactly as stored in the book (JPEG, PNG, …). */
  readCover: (bookId: string) => call<ArrayBuffer>("read_epub_cover", { id: bookId }),
};

/** Reads a managed book through HTTP Range requests; its size is already known. */
class RangeReader extends Reader<string> {
  constructor(
    private readonly url: string,
    size: number,
  ) {
    super(url);
    this.size = size;
  }

  override readUint8Array(index: number, length: number): Promise<Uint8Array> {
    return fetchRange(this.url, index, Math.min(this.size, index + length));
  }
}

/**
 * Opens a managed EPUB for reading. zip.js reads the archive through HTTP Range requests, so
 * only the ZIP directory and the entries being displayed are ever fetched.
 */
export async function openEpub(book: Pick<Book, "id" | "fileSize">): Promise<FoliateBook> {
  const { EPUB } = await import("foliate-js/epub.js");
  const reader = new ZipReader(new RangeReader(bookUrl(book.id), book.fileSize));
  const entries = new Map(
    (await reader.getEntries())
      .filter((entry): entry is FileEntry => !entry.directory)
      .map((entry) => [entry.filename, entry]),
  );
  const loader: FoliateLoader = {
    loadText: (name) => entries.get(name)?.getData(new TextWriter()) ?? null,
    loadBlob: (name, type) => entries.get(name)?.getData(new BlobWriter(type)) ?? null,
    getSize: (name) => entries.get(name)?.uncompressedSize ?? 0,
  };
  const epub = await new EPUB(loader).init();
  // Every (X)HTML, SVG and CSS resource passes through here before it becomes a blob: URL.
  epub.transformTarget?.addEventListener("data", (event) => {
    const detail = (event as CustomEvent<{ data: unknown; type: string }>).detail;
    if (typeof detail.data === "string") detail.data = sanitizeResource(detail.data, detail.type);
  });
  return epub;
}
