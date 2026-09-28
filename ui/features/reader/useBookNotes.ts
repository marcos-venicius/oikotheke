import { useCallback, useEffect, useState } from "react";
import type { Note } from "@/lib/types";
import { toast } from "@/components/toast";
import { describeError } from "@/services/ipc";
import { notesService } from "@/services/notesService";

/** Notes of one book, loaded once per reading session and kept in sync with the backend. */
export function useBookNotes(bookId: string) {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    let active = true;
    notesService
      .list(bookId)
      .then((list) => active && setNotes(list))
      .catch((error) =>
        toast("Could not load notes", { tone: "error", description: describeError(error) }),
      );
    return () => {
      active = false;
    };
  }, [bookId]);

  const fail = (action: string) => (error: unknown) => {
    toast(`Could not ${action} the note`, { tone: "error", description: describeError(error) });
    throw error;
  };

  const create = useCallback(
    async (location: string, label: string | null, content: string) => {
      const note = await notesService.create(bookId, location, label, content).catch(fail("save"));
      setNotes((list) => [...list, note]);
      return note;
    },
    [bookId],
  );

  const update = useCallback(async (id: string, content: string) => {
    const note = await notesService.update(id, content).catch(fail("save"));
    setNotes((list) => list.map((n) => (n.id === id ? note : n)));
    return note;
  }, []);

  const remove = useCallback(async (id: string) => {
    await notesService.delete(id).catch(fail("delete"));
    setNotes((list) => list.filter((n) => n.id !== id));
  }, []);

  return { notes, create, update, remove };
}

export type BookNotes = ReturnType<typeof useBookNotes>;
