import type { Book } from "@/lib/types";
import { createStore } from "@/lib/store";
import { describeError } from "./ipc";
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

/**
 * Second import stage, run in the background one book at a time: read metadata and render
 * the cover with pdf.js, then mark the book ready. Unreadable PDFs are rolled back.
 */
function process(jobId: string, book: Book) {
  if (processing.has(book.id)) return;
  processing.add(book.id);
  updateJob(jobId, { stage: "processing" });

  chain = chain.then(async () => {
    const task = openDocument(book);
    try {
      let doc;
      try {
        doc = await task.promise;
      } catch {
        await libraryService.abortImport(book.id).catch(() => {});
        fail(jobId, "This PDF is damaged or can't be read.");
        return;
      }
      const metadata = await readMetadata(doc, book.title);
      try {
        await libraryService.saveCover(book.id, await renderCover(doc));
      } catch (error) {
        // A missing cover is not fatal; the shelf shows a placeholder.
        console.warn("cover generation failed", error);
      }
      const ready = await libraryService.finalizeImport(book.id, metadata);
      removeJob(jobId);
      readyListeners.forEach((cb) => cb(ready));
    } catch (error) {
      fail(jobId, describeError(error));
    } finally {
      processing.delete(book.id);
      await task.destroy();
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
