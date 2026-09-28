// Copies pdf.js runtime assets (CMaps, standard fonts, wasm decoders, ICC profiles) into
// public/pdfjs so the reader works fully offline. Runs before dev and build.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const target = join(import.meta.dirname, "..", "public", "pdfjs");

mkdirSync(target, { recursive: true });
for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  cpSync(join(pdfjsRoot, dir), join(target, dir), { recursive: true });
}
