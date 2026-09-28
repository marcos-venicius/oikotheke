import { useCallback, useEffect, useState } from "react";
import { settingsService } from "@/services/settingsService";
import { DEFAULT_FONT_SIZE, FONT_SIZES, type EpubFlow } from "./epubStyles";

const FONT_SIZE_KEY = "epub.fontSize";
const FLOW_KEY = "epub.flow";

export interface EpubPrefs {
  fontSize: number;
  flow: EpubFlow;
}

function parse(settings: Record<string, string>): EpubPrefs {
  const size = Number(settings[FONT_SIZE_KEY]);
  return {
    fontSize: (FONT_SIZES as readonly number[]).includes(size) ? size : DEFAULT_FONT_SIZE,
    flow: settings[FLOW_KEY] === "scrolled" ? "scrolled" : "paginated",
  };
}

/** EPUB reading preferences, shared by all books and stored in the app settings. */
export function useEpubPrefs() {
  const [prefs, setPrefs] = useState<EpubPrefs | null>(null);

  useEffect(() => {
    let active = true;
    settingsService
      .getAll()
      .catch(() => ({}))
      .then((settings) => active && setPrefs(parse(settings)));
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((patch: Partial<EpubPrefs>) => {
    setPrefs((current) => (current ? { ...current, ...patch } : current));
    if (patch.fontSize !== undefined)
      void settingsService.set(FONT_SIZE_KEY, String(patch.fontSize)).catch(() => {});
    if (patch.flow !== undefined) void settingsService.set(FLOW_KEY, patch.flow).catch(() => {});
  }, []);

  return { prefs, update };
}
