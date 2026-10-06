import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export interface SearchStatus {
  /** Hits found so far. */
  total: number;
  /** Index of the selected hit, if any. */
  current: number | null;
  /** The book is still being scanned. */
  searching: boolean;
}

/** Scans a book for a query, yielding the hits of each part (page, chapter) in reading order. */
export type SearchScan<Hit> = (query: string) => AsyncGenerator<Hit[]>;

interface Options<Hit> {
  /** True for hits at or after the reading position: the search starts at the first of them. */
  isAhead: (hit: Hit) => boolean;
  /** Shows a hit. */
  go: (hit: Hit) => void;
}

/**
 * Format-agnostic search in a book: runs `scan` for the query (restarting when it changes),
 * selects the first hit from the reading position on, and steps through the hits.
 */
export function useSearch<Hit>(query: string, scan: SearchScan<Hit> | null, options: Options<Hit>) {
  const [run, setRun] = useState<{ query: string; hits: Hit[]; done: boolean } | null>(null);
  const [selected, setSelected] = useState<{ query: string; index: number } | null>(null);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    if (!query || !scan) return;
    let active = true;
    const iter = scan(query);
    const hits: Hit[] = [];
    let picked = false;
    const pick = (index: number) => {
      picked = true;
      setSelected({ query, index });
      latest.current.go(hits[index]);
    };
    void (async () => {
      try {
        for await (const batch of iter) {
          if (!active) return;
          if (batch.length === 0) continue;
          const first = hits.length;
          hits.push(...batch);
          setRun({ query, hits: hits.slice(), done: false });
          if (!picked) {
            const ahead = batch.findIndex((hit) => latest.current.isAhead(hit));
            if (ahead >= 0) pick(first + ahead);
          }
        }
      } catch (error) {
        console.error("search failed", error);
      }
      if (!active) return;
      setRun({ query, hits, done: true });
      if (!picked && hits.length > 0) pick(0);
    })();
    return () => {
      active = false;
      void iter.return(undefined);
    };
  }, [query, scan]);

  const hits = useMemo(() => (query && run?.query === query ? run.hits : []), [query, run]);
  const current = selected?.query === query ? selected.index : null;
  const searching = Boolean(query && scan) && !(run?.query === query && run.done);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (hits.length === 0) return;
      const index =
        current === null
          ? dir > 0
            ? 0
            : hits.length - 1
          : (current + dir + hits.length) % hits.length;
      setSelected({ query, index });
      latest.current.go(hits[index]);
    },
    [hits, current, query],
  );

  const status: SearchStatus = { total: hits.length, current, searching };
  return {
    status,
    currentHit: current === null ? null : (hits[current] ?? null),
    next: useCallback(() => step(1), [step]),
    prev: useCallback(() => step(-1), [step]),
  };
}
