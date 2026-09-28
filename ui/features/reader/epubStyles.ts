/** How EPUB text flows: book-like pages, or one continuous scroll per chapter. */
export type EpubFlow = "paginated" | "scrolled";

/** Font sizes in percent of the book's own size. */
export const FONT_SIZES = [80, 90, 100, 110, 120, 135, 150, 175, 200] as const;
export const DEFAULT_FONT_SIZE = 100;

/** The next font size in `direction`, snapping unknown values to the closest step. */
export function stepFontSize(current: number, direction: 1 | -1): number {
  const index = FONT_SIZES.reduce(
    (best, size, i) => (Math.abs(size - current) < Math.abs(FONT_SIZES[best] - current) ? i : best),
    0,
  );
  const next = Math.min(FONT_SIZES.length - 1, Math.max(0, index + direction));
  return FONT_SIZES[next];
}

export interface ContentTheme {
  dark: boolean;
  text: string;
  accent: string;
  /** Page color; the paginator paints it behind every column (`--theme-bg-color`). */
  background: string;
}

/**
 * CSS injected into every EPUB section. Pages take the app background in both themes; light
 * mode keeps the book's own text colors, dark mode forces readable text, since most books
 * hardcode black on white.
 */
export function contentCss(fontSize: number, theme: ContentTheme): string {
  // Books use `!important` too (e.g. pandoc's `code.sourceCode > span { color: black
  // !important }`), and between two `!important` rules the more specific wins. Each
  // `:not(#…)` counts as an id, which outranks the class-based selectors books use.
  const strong = ":not(#oikotheke):not(#oikotheke)";
  const dark = theme.dark
    ? `
    html${strong}, body${strong}, body *${strong} {
      color: ${theme.text} !important;
      background-color: transparent !important;
      border-color: currentColor;
    }
    :is(a:link, a:visited, a:link *, a:visited *)${strong} { color: ${theme.accent} !important; }
    img${strong} { background-color: #fff !important; }`
    : "";
  return `
    html {
      --theme-bg-color: ${theme.background};
      color-scheme: ${theme.dark ? "dark" : "light"};
      color: ${theme.text};
      font-size: ${fontSize}% !important;
    }
    p, li, blockquote, dd {
      line-height: 1.5;
      -webkit-hyphens: auto;
      hyphens: auto;
      widows: 2;
      orphans: 2;
    }
    pre { white-space: pre-wrap !important; }
    img, svg, video { max-width: 100%; height: auto; }
    ${dark}
  `;
}
