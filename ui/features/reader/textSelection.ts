import { normalizeUnicode } from "@/services/pdfService";

/**
 * Makes drag selection in a PDF text layer behave. WebKit (and Chromium before 148) extend the
 * selection to the end of the page while the pointer is between text spans; moving the layer's
 * end-of-content block right after the selection's moving end keeps it under the pointer.
 * Adapted from pdf.js `TextLayerBuilder` (Copyright 2012 Mozilla Foundation, Apache License 2.0).
 * Returns a function that removes the listeners.
 */
export function bindTextSelection(layer: HTMLElement, end: HTMLElement): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  let pointerDown = false;
  let prevRange: Range | null = null;

  const reset = () => {
    layer.append(end);
    end.style.width = "";
    end.style.height = "";
    end.style.userSelect = "";
    layer.classList.remove("selecting");
  };

  layer.addEventListener("mousedown", () => layer.classList.add("selecting"), { signal });
  // Copy the text as words, not as the PDF's glyphs (ligatures, null characters).
  layer.addEventListener(
    "copy",
    (e) => {
      const text = document.getSelection()?.toString() ?? "";
      e.clipboardData?.setData("text/plain", normalizeUnicode(text).replaceAll("\0", ""));
      e.preventDefault();
    },
    { signal },
  );
  document.addEventListener("pointerdown", () => (pointerDown = true), { signal });
  document.addEventListener(
    "pointerup",
    () => {
      pointerDown = false;
      reset();
    },
    { signal },
  );
  window.addEventListener(
    "blur",
    () => {
      pointerDown = false;
      reset();
    },
    { signal },
  );
  document.addEventListener("keyup", () => !pointerDown && reset(), { signal });

  const needsFix = !(Number(/\bChrome\/(\d+)\b/.exec(navigator.userAgent)?.[1] ?? 0) >= 148);
  document.addEventListener(
    "selectionchange",
    () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) return reset();
      const range = selection.getRangeAt(0);
      if (!range.intersectsNode(layer)) return reset();
      layer.classList.add("selecting");
      if (!needsFix) return;

      const modifyStart =
        prevRange !== null &&
        (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
          range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
      let anchor: Node | null = modifyStart ? range.startContainer : range.endContainer;
      if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
      if (anchor && !modifyStart && range.endOffset === 0) {
        // The selection ends at the start of a node: anchor on the last text before it.
        do {
          while (anchor && anchor !== layer && !anchor.previousSibling) anchor = anchor.parentNode;
          anchor = anchor && anchor !== layer ? anchor.previousSibling : null;
        } while (anchor && !anchor.childNodes.length);
      }
      const parent = anchor?.parentElement;
      if (anchor && parent?.closest(".textLayer") === layer) {
        end.style.width = layer.style.width;
        end.style.height = layer.style.height;
        end.style.userSelect = "text";
        parent.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
      }
      prevRange = range.cloneRange();
    },
    { signal },
  );
  return () => controller.abort();
}
