import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
const { webUrl } = await import("./linkService");

describe("webUrl", () => {
  it("accepts only http and https", () => {
    expect(webUrl("https://example.com/a?b=1")?.host).toBe("example.com");
    expect(webUrl("http://127.0.0.1:8765/x")?.host).toBe("127.0.0.1:8765");
    for (const href of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "mailto:a@b.c",
      "blob:http://localhost/1",
      "chapter2.xhtml",
      "",
    ])
      expect(webUrl(href), href).toBeNull();
  });
});
