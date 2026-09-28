import { convertFileSrc } from "@tauri-apps/api/core";
import type { Book } from "@/lib/types";

/** Managed files are served by the backend's `oikotheke://` protocol (see `protocol.rs`). */
const SCHEME = "oikotheke";
/** Must stay below the backend's per-response cap (16 MB). */
const MAX_FETCH = 8 * 1024 * 1024;

export function bookUrl(id: string): string {
  return convertFileSrc(`book/${id}`, SCHEME);
}

export function coverUrl(book: Book): string | null {
  if (!book.coverPath) return null;
  return `${convertFileSrc(`cover/${book.id}`, SCHEME)}?v=${book.updatedAt}`;
}

/** Fetches bytes [begin, end) with HTTP Range requests, splitting large ranges. */
export async function fetchRange(url: string, begin: number, end: number): Promise<Uint8Array> {
  const out = new Uint8Array(end - begin);
  let offset = begin;
  while (offset < end) {
    const last = Math.min(end, offset + MAX_FETCH) - 1;
    const res = await fetch(url, { headers: { Range: `bytes=${offset}-${last}` } });
    if (res.status !== 206 && res.status !== 200)
      throw new Error(`Range request failed: ${res.status}`);
    const chunk = new Uint8Array(await res.arrayBuffer());
    if (chunk.length === 0) throw new Error("Empty range response");
    out.set(chunk.subarray(0, end - offset), offset - begin);
    offset += chunk.length;
  }
  return out;
}
