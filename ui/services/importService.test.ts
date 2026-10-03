import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "@/lib/types";
import { AppError } from "./ipc";

const epub = vi.hoisted(() => ({ readMetadata: vi.fn(), readCover: vi.fn() }));
vi.mock("./epubService", () => ({ epubService: epub }));
vi.mock("./coverImage", () => ({ imageToCover: async () => new Uint8Array([1, 2, 3]) }));
const library = vi.hoisted(() => ({ importFromCatalog: vi.fn() }));
vi.mock("./libraryService", () => ({ libraryService: library }));
vi.mock("./pdfService", () => ({}));

const { extractBook, importJobs, importService, UnreadableBook } = await import("./importService");

const book = { id: "b", format: "epub", title: "file name" } as Book;

describe("extractBook (EPUB)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses package metadata and turns the cover into a thumbnail", async () => {
    epub.readMetadata.mockResolvedValue({ title: "Dune", author: "Frank Herbert", hasCover: true });
    epub.readCover.mockResolvedValue(new ArrayBuffer(4));
    await expect(extractBook(book)).resolves.toEqual({
      metadata: { title: "Dune", author: "Frank Herbert", pageCount: 0 },
      cover: new Uint8Array([1, 2, 3]),
    });
  });

  it("falls back to the file name and skips missing covers", async () => {
    epub.readMetadata.mockResolvedValue({ title: null, author: null, hasCover: false });
    await expect(extractBook(book)).resolves.toEqual({
      metadata: { title: "file name", author: null, pageCount: 0 },
      cover: null,
    });
    expect(epub.readCover).not.toHaveBeenCalled();
  });

  it("keeps the book when only the cover fails", async () => {
    epub.readMetadata.mockResolvedValue({ title: "T", author: null, hasCover: true });
    epub.readCover.mockRejectedValue(new AppError("notFound", "gone"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(extractBook(book)).resolves.toMatchObject({ cover: null });
  });

  it("rejects DRM and damaged books with a readable message", async () => {
    for (const [kind, message] of [
      ["drm", "This book is protected by DRM and can't be imported."],
      ["unreadable", "This book is damaged or can't be read."],
    ] as const) {
      epub.readMetadata.mockRejectedValueOnce({ kind, message: "backend detail" });
      const error = await extractBook(book).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UnreadableBook);
      expect((error as Error).message).toBe(message);
    }
  });

  it("does not treat other failures as a bad book", async () => {
    epub.readMetadata.mockRejectedValue({ kind: "database", message: "locked" });
    const error = await extractBook(book).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(UnreadableBook);
  });
});

describe("importFromCatalog", () => {
  it("tracks the download as a queued job tied to its catalog entry", async () => {
    library.importFromCatalog.mockResolvedValue({
      jobId: "j",
      fileName: "Dom Casmurro",
      totalBytes: 0,
      catalogId: "dom-casmurro",
    });
    await importService.importFromCatalog("dom-casmurro");
    expect(library.importFromCatalog).toHaveBeenCalledWith("dom-casmurro");
    expect(importJobs.get()).toEqual([
      {
        jobId: "j",
        fileName: "Dom Casmurro",
        totalBytes: 0,
        copiedBytes: 0,
        stage: "queued",
        catalogId: "dom-casmurro",
      },
    ]);
  });
});
