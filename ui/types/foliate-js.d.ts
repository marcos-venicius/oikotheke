// Minimal typings for the parts of foliate-js the reader uses (the package ships plain JS).
// See node_modules/foliate-js/README.md for the full interfaces.

declare module "foliate-js/epub.js" {
  import type { FoliateBook, FoliateLoader } from "foliate-js/view.js";
  export class EPUB {
    constructor(loader: FoliateLoader);
    init(): Promise<FoliateBook>;
  }
}

declare module "foliate-js/view.js" {
  export interface FoliateLoader {
    loadText(name: string): Promise<string | null> | null;
    loadBlob(name: string, type?: string): Promise<Blob | null> | null;
    getSize(name: string): number;
  }

  export interface TocItem {
    label: string;
    href: string;
    subitems?: TocItem[];
  }

  export interface FoliateBook {
    dir?: "ltr" | "rtl";
    /** Fires `data` for each resource before it is loaded; handlers may replace `detail.data`. */
    transformTarget?: EventTarget;
    toc?: TocItem[];
    sections: unknown[];
    destroy?(): void;
  }

  export interface RelocateDetail {
    /** Progress through the whole book, 0..1. */
    fraction: number;
    cfi: string;
    tocItem?: { label?: string; href?: string };
  }

  export interface Paginator extends HTMLElement {
    setStyles(css: string): void;
    next(): Promise<void>;
    prev(): Promise<void>;
  }

  export class View extends HTMLElement {
    book: FoliateBook;
    renderer: Paginator;
    lastLocation: RelocateDetail | null;
    open(book: FoliateBook): Promise<void>;
    init(options: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>;
    close(): void;
    goTo(target: string | number): Promise<void>;
    goToFraction(fraction: number): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    prev(): Promise<void>;
    next(): Promise<void>;
  }
}
