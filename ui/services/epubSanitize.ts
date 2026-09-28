/**
 * Second line of defense for EPUB content, after the CSP (see CLAUDE.md, "Security and
 * privacy"). foliate-js already drops packaged scripts; this removes what it keeps: inline
 * scripts, event handlers, embedded browsing contexts and references to the network.
 */

const MARKUP_TYPES = new Set(["application/xhtml+xml", "text/html", "image/svg+xml"]);

/** Elements that run code, embed other documents or redirect. */
const BLOCKED_ELEMENTS = "script, iframe, frame, frameset, object, embed, applet, base, portal";

/** Attributes that load resources. `href` on links is kept: the reader blocks navigation. */
const RESOURCE_ATTRIBUTES = [
  "src",
  "srcset",
  "poster",
  "data",
  "background",
  "action",
  "formaction",
];

/** A URL that leaves the book: any scheme except the `blob:`/`data:` ones foliate-js creates. */
export function isRemote(url: string): boolean {
  const value = url.trim().toLowerCase();
  if (value.startsWith("//")) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(value)?.[1];
  return scheme !== undefined && scheme !== "blob" && scheme !== "data";
}

/** Replaces remote `url(...)` and `@import` targets with nothing. */
export function sanitizeCss(css: string): string {
  return css
    .replace(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi, (match, _quote, url: string) =>
      isRemote(url) ? "none" : match,
    )
    .replace(
      /@import\s+(?:url\()?\s*["']?([^"')\s;]*)["']?\s*\)?[^;]*;?/gi,
      (match, url: string) => (isRemote(url) ? "" : match),
    );
}

/** Cleans a parsed (X)HTML or SVG document in place. */
export function sanitizeDocument(doc: Document): void {
  doc.querySelectorAll(BLOCKED_ELEMENTS).forEach((el) => el.remove());
  doc.querySelectorAll('meta[http-equiv="refresh" i]').forEach((el) => el.remove());
  doc.querySelectorAll("link[href]").forEach((el) => {
    if (isRemote(el.getAttribute("href") ?? "")) el.remove();
  });
  doc.querySelectorAll("style").forEach((el) => {
    el.textContent = sanitizeCss(el.textContent ?? "");
  });

  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.localName.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on")) el.removeAttributeNode(attr);
      else if (name === "style") el.setAttribute(attr.name, sanitizeCss(value));
      else if (RESOURCE_ATTRIBUTES.includes(name) && value.split(",").some(isRemote))
        el.removeAttributeNode(attr);
      else if (name === "href" && /^\s*(javascript|vbscript):/i.test(value))
        el.removeAttributeNode(attr);
      // SVG `<image xlink:href>`/`<use href>` load resources; `<a href>` only navigates.
      else if (name === "href" && el.localName !== "a" && isRemote(value))
        el.removeAttributeNode(attr);
    }
  }
}

/** Sanitizes one resource as foliate-js hands it over, or returns it unchanged. */
export function sanitizeResource(data: string, type: string): string {
  if (type === "text/css") return sanitizeCss(data);
  if (!MARKUP_TYPES.has(type)) return data;
  const doc = new DOMParser().parseFromString(data, type as DOMParserSupportedType);
  sanitizeDocument(doc);
  return new XMLSerializer().serializeToString(doc);
}
