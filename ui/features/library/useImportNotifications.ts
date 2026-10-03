import { useEffect } from "react";
import { toast } from "@/components/toast";
import { importService } from "@/services/importService";
import { refreshLibrary } from "./libraryStore";

/** Keeps the library fresh and tells the user how background imports end, on any page. */
export function useImportNotifications() {
  useEffect(() => {
    importService.init();
    const offReady = importService.onBookReady((book) => {
      void refreshLibrary();
      toast(`Added “${book.title}”`, { tone: "success" });
    });
    const offFailure = importService.onFailure((job) =>
      toast(`Couldn't import ${job.fileName}`, { tone: "error", description: job.error }),
    );
    return () => {
      offReady();
      offFailure();
    };
  }, []);
}
