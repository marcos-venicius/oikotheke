import type { Note } from "@/lib/types";
import { call } from "./ipc";

export const notesService = {
  list: (bookId: string) => call<Note[]>("list_notes", { bookId }),
  create: (bookId: string, pageNumber: number, content: string) =>
    call<Note>("create_note", { bookId, pageNumber, content }),
  update: (id: string, content: string) => call<Note>("update_note", { id, content }),
  delete: (id: string) => call<void>("delete_note", { id }),
};
