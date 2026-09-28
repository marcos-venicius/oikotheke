import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

/** Native file drag and drop (gives real paths, unlike HTML5 DnD). Returns whether files hover. */
export function useFileDrop(onDrop: (paths: string[]) => void): boolean {
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (payload.type === "enter") setHovering(true);
        else if (payload.type === "leave") setHovering(false);
        else if (payload.type === "drop") {
          setHovering(false);
          onDrop(payload.paths);
        }
      })
      .then((fn) => (disposed ? fn() : (unlisten = fn)))
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onDrop]);

  return hovering;
}
