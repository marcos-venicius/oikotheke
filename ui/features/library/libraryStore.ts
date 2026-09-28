import type { Book } from "@/lib/types";
import { createStore } from "@/lib/store";
import { libraryService } from "@/services/libraryService";

interface LibraryState {
  books: Book[];
  removed: Book[];
  loaded: boolean;
}

export const libraryStore = createStore<LibraryState>({ books: [], removed: [], loaded: false });

export async function refreshLibrary(): Promise<Book[]> {
  const [books, removed] = await Promise.all([
    libraryService.listBooks(),
    libraryService.listRemovedBooks(),
  ]);
  libraryStore.set({ books, removed, loaded: true });
  return books;
}
