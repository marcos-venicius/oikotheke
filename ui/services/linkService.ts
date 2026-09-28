import { openUrl } from "@tauri-apps/plugin-opener";

/** Only web pages can be opened, and only in the system browser, never inside the app. */
export function webUrl(href: string): URL | null {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export const linkService = {
  /** Opens a web page in the default browser. Call only after the user confirmed it. */
  openInBrowser: (url: URL) => openUrl(url.href),
};
