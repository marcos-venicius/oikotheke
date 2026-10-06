/** A text item of a PDF page, as pdf.js reports it (one per text-layer span). */
export interface TextRun {
  str: string;
  hasEOL?: boolean;
}

/** A position in a page's text: character `offset` inside item `item`. */
export interface TextPoint {
  item: number;
  offset: number;
}

/** A match from `start` to `end` (exclusive), possibly across items. */
export interface TextMatch {
  start: TextPoint;
  end: TextPoint;
}

/**
 * A page's text folded for searching (see `foldText`), with, for each folded character, where
 * it starts and ends in the original items.
 */
export interface PageText {
  text: string;
  starts: TextPoint[];
  ends: TextPoint[];
}

/** Case- and accent-insensitive form of a character ("É" → "e", "ﬁ" → "fi"). */
function foldChar(ch: string): string {
  return ch.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Folds a search query: no case, no accents, single spaces, trimmed. */
export function foldText(text: string): string {
  return Array.from(text, (ch) => (/\s/u.test(ch) ? " " : foldChar(ch)))
    .join("")
    .replace(/ +/g, " ")
    .trim();
}

/**
 * Indexes a page for searching. Items are joined as pdf.js lays them out: directly, with a space
 * at line ends; runs of whitespace count as one space.
 */
export function indexPage(runs: TextRun[]): PageText {
  let text = "";
  const starts: TextPoint[] = [];
  const ends: TextPoint[] = [];
  let afterSpace = true;
  const push = (folded: string, start: TextPoint, end: TextPoint) => {
    text += folded;
    for (let i = 0; i < folded.length; i++) {
      starts.push(start);
      ends.push(end);
    }
  };

  runs.forEach(({ str, hasEOL }, item) => {
    let offset = 0;
    for (const ch of str) {
      const start = { item, offset };
      offset += ch.length;
      const end = { item, offset };
      if (/\s/u.test(ch)) {
        if (!afterSpace) push(" ", start, end);
        afterSpace = true;
      } else {
        const folded = foldChar(ch);
        if (folded) {
          push(folded, start, end);
          afterSpace = false;
        } else if (!afterSpace && ends.at(-1)?.item === item) {
          // A lone combining mark belongs to the character before it.
          ends[ends.length - 1] = end;
        }
      }
    }
    if (hasEOL && !afterSpace) {
      push(" ", { item, offset }, { item, offset });
      afterSpace = true;
    }
  });
  return { text, starts, ends };
}

/** Non-overlapping matches of an already folded query, in reading order. */
export function findMatches(page: PageText, query: string): TextMatch[] {
  const matches: TextMatch[] = [];
  if (!query) return matches;
  for (let i = page.text.indexOf(query); i >= 0; i = page.text.indexOf(query, i + query.length)) {
    matches.push({ start: page.starts[i], end: page.ends[i + query.length - 1] });
  }
  return matches;
}
