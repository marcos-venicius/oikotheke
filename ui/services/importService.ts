import type { Book, BookFormat, BookMetadata } from "@/lib/types";
import { createStore } from "@/lib/store";
import { imageToCover } from "./coverImage";
import { epubService } from "./epubService";
import { AppError, describeError } from "./ipc";
import { libraryService } from "./libraryService";
import { openDocument, readMetadata, renderCover } from "./pdfService";

export type ImportStage = "queued" | "copying" | "processing" | "failed";

export interface ImportJobState {
  jobId: string;
  fileName: string;
  totalBytes: number;
  copiedBytes: number;
  stage: ImportStage;
  error?: string;
}

/** Imports in flight, in the order they were started. */
export const importJobs = createStore<ImportJobState[]>([]);

type Listener = (book: Book) => void;
const readyListeners = new Set<Listener>();
const failureListeners = new Set<(job: ImportJobState) => void>();
const processing = new Set<string>();
let chain: Promise<void> = Promise.resolve();
let initialized = false;

function updateJob(jobId: string, patch: Partial<ImportJobState>) {
  importJobs.set((jobs) => jobs.map((j) => (j.jobId === jobId ? { ...j, ...patch } : j)));
}

function removeJob(jobId: string) {
  importJobs.set((jobs) => jobs.filter((j) => j.jobId !== jobId));
}

function fail(jobId: string, error: string) {
  updateJob(jobId, { stage: "failed", error });
  const job = importJobs.get().find((j) => j.jobId === jobId);
  if (job) failureListeners.forEach((cb) => cb(job));
  window.setTimeout(() => removeJob(jobId), 6000);
}

/** The book can't be imported; the copy is rolled back and the message shown. */
export class UnreadableBook extends Error {}

export interface Extracted {
  metadata: BookMetadata;
  /** JPEG thumbnail, or null when the book has none (the shelf shows a placeholder). */
  cover: Uint8Array | null;
}

/** A missing cover is never fatal. */
async function optionalCover(render: () => Promise<Uint8Array>): Promise<Uint8Array | null> {
  try {
    return await render();
  } catch (error) {
    console.warn("cover generation failed", error);
    return null;
  }
}

async function extractPdf(book: Book): Promise<Extracted> {
  const task = openDocument(book);
  try {
    const doc = await task.promise.catch(() => {
      throw new UnreadableBook("This PDF is damaged or can't be read.");
    });
    return {
      metadata: await readMetadata(doc, book.title),
      cover: await optionalCover(() => renderCover(doc)),
    };
  } finally {
    await task.destroy();
  }
}

async function extractEpub(book: Book): Promise<Extracted> {
  const meta = await epubService.readMetadata(book.id).catch((error) => {
    const err = AppError.from(error);
    if (err.kind === "drm" || err.kind === "unreadable") {
      throw new UnreadableBook(describeError(err));
    }
    throw err;
  });
  return {
    metadata: { title: meta.title ?? book.title, author: meta.author, pageCount: 0 },
    cover: meta.hasCover
      ? await optionalCover(async () => imageToCover(await epubService.readCover(book.id)))
      : null,
  };
}

const extractors: Record<BookFormat, (book: Book) => Promise<Extracted>> = {
  pdf: extractPdf,
  epub: extractEpub,
};

/** Metadata and cover of a copied book, read the way its format requires. */
export function extractBook(book: Book): Promise<Extracted> {
  return extractors[book.format](book);
}

/**
 * Second import stage, run in the background one book at a time: read metadata and make the
 * cover, then mark the book ready. Unreadable books are rolled back.
 */
function process(jobId: string, book: Book) {
  if (processing.has(book.id)) return;
  processing.add(book.id);
  updateJob(jobId, { stage: "processing" });

  chain = chain.then(async () => {
    try {
      let extracted;
      try {
        extracted = await extractBook(book);
      } catch (error) {
        if (!(error instanceof UnreadableBook)) throw error;
        await libraryService.abortImport(book.id).catch(() => {});
        fail(jobId, error.message);
        return;
      }
      if (extracted.cover) {
        await libraryService
          .saveCover(book.id, extracted.cover)
          .catch((error) => console.warn("saving cover failed", error));
      }
      const ready = await libraryService.finalizeImport(book.id, extracted.metadata);
      removeJob(jobId);
      readyListeners.forEach((cb) => cb(ready));
    } catch (error) {
      fail(jobId, describeError(error));
    } finally {
      processing.delete(book.id);
    }
  });
}

export const importService = {
  /** Subscribes to backend import events. Safe to call more than once. */
  init() {
    if (initialized) return;
    initialized = true;
    void libraryService.onImportProgress(({ jobId, copiedBytes }) =>
      updateJob(jobId, { stage: "copying", copiedBytes }),
    );
    void libraryService.onImportCopied(({ jobId, book }) => {
      updateJob(jobId, { copiedBytes: book.fileSize });
      process(jobId, book);
    });
    void libraryService.onImportFailed(({ jobId, error }) => fail(jobId, describeError(error)));
  },

  async importFiles(paths: string[]) {
    if (paths.length === 0) return;
    const jobs = await libraryService.importFiles(paths);
    importJobs.set((current) => [
      ...current,
      ...jobs.map((job) => ({ ...job, copiedBytes: 0, stage: "queued" as const })),
    ]);
  },

  /** Completes imports interrupted by a previous shutdown (file copied, not processed). */
  resume(books: Book[]) {
    for (const book of books) {
      if (book.status !== "importing" || processing.has(book.id)) continue;
      const jobId = `resume-${book.id}`;
      importJobs.set((jobs) => [
        ...jobs,
        {
          jobId,
          fileName: book.title,
          totalBytes: book.fileSize,
          copiedBytes: book.fileSize,
          stage: "processing",
        },
      ]);
      process(jobId, book);
    }
  },

  onBookReady(cb: Listener): () => void {
    readyListeners.add(cb);
    return () => readyListeners.delete(cb);
  },

  onFailure(cb: (job: ImportJobState) => void): () => void {
    failureListeners.add(cb);
    return () => failureListeners.delete(cb);
  },
};
