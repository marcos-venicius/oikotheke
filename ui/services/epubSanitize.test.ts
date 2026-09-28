// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isRemote, sanitizeCss, sanitizeResource } from "./epubSanitize";

const XHTML = "application/xhtml+xml";
const page = (head: string, body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink"><head><title>t</title>${head}</head><body>${body}</body></html>`;

describe("isRemote", () => {
  it("flags every scheme except blob: and data:", () => {
    for (const url of [
      "http://x",
      "HTTPS://x",
      "//x/y",
      "ftp://x",
      "javascript:alert(1)",
      " wss://x",
    ])
      expect(isRemote(url), url).toBe(true);
    for (const url of [
      "blob:http://localhost/1",
      "data:image/png;base64,AA",
      "img/a.png",
      "#top",
      "",
    ])
      expect(isRemote(url), url).toBe(false);
  });
});

describe("sanitizeCss", () => {
  it("drops remote urls and imports, keeps local ones", () => {
    const css = `@import "https://evil/x.css"; @import url(//evil/y.css);
      @font-face { src: url("https://evil/f.woff") }
      body { background: url(blob:http://localhost/abc) }`;
    const out = sanitizeCss(css);
    expect(out).not.toContain("evil");
    expect(out).toContain("url(blob:http://localhost/abc)");
    expect(out).toContain("src: none");
  });
});

describe("sanitizeResource", () => {
  it("removes scripts, handlers, frames and remote resources", () => {
    const out = sanitizeResource(
      page(
        `<script>alert(1)</script><link rel="stylesheet" href="https://evil/s.css"/>
         <link rel="stylesheet" href="blob:http://localhost/s"/>
         <meta http-equiv="refresh" content="0;url=https://evil"/>
         <style>@import "https://evil/i.css"; p { color: red }</style>`,
        `<p onclick="alert(1)" style="background: url(https://evil/b.png)">text</p>
         <img src="https://evil/i.png" alt="remote"/><img src="blob:http://localhost/i" alt="local"/>
         <img srcset="a.png 1x, https://evil/b.png 2x" alt="set"/>
         <iframe src="https://evil/f"></iframe><object data="https://evil/o"></object>
         <svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="https://evil/s.png"/><script>alert(1)</script></svg>
         <a href="https://example.com/ok">web link</a><a href="javascript:alert(1)">js link</a>`,
      ),
      XHTML,
    );
    expect(out).not.toMatch(/<script|onclick|<iframe|<object|refresh|evil/);
    expect(out).toContain("blob:http://localhost/s");
    expect(out).toContain('src="blob:http://localhost/i"');
    expect(out).toContain("p { color: red }");
    expect(out).toContain('href="https://example.com/ok"');
    expect(out).toContain(">text</p>");
  });

  it("cleans stylesheets and leaves other resources alone", () => {
    expect(sanitizeResource('@import "http://evil/x.css";', "text/css")).not.toContain("evil");
    expect(sanitizeResource("plain", "text/plain")).toBe("plain");
  });
});
