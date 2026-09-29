// Builds the website (docs/) into site-dist/, filling in the current version and the latest
// changelog entries. The CI deploys the result to GitHub Pages.
//
// Usage: node scripts/build-site.mjs [out-dir]
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readReleases } from "./changelog.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = process.argv[2] ?? `${root}site-dist`;
const RELEASES_SHOWN = 3;

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The inline markdown used in the changelog: code, bold, italics and links. */
function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/** The block markdown used in the changelog: `###` headings, paragraphs and `-` lists. */
function markdown(body) {
  const html = [];
  let list = null; // items of the open list; the last one grows with indented lines
  let paragraph = null;
  const flush = () => {
    if (list) html.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    if (paragraph) html.push(`<p>${inline(paragraph)}</p>`);
    list = paragraph = null;
  };
  for (const line of body.split("\n")) {
    if (!line.trim()) {
      flush();
    } else if (line.startsWith("### ")) {
      flush();
      html.push(`<h4>${inline(line.slice(4))}</h4>`);
    } else if (line.startsWith("- ")) {
      if (paragraph) flush();
      (list ??= []).push(line.slice(2));
    } else if (list && /^\s/.test(line)) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      paragraph = paragraph ? `${paragraph} ${line.trim()}` : line.trim();
    }
  }
  flush();
  return html.join("\n");
}

function releaseHtml({ version, date, body }) {
  return `<article class="release">
  <header><h3>v${escape(version)}</h3><time datetime="${date}">${date}</time></header>
  ${markdown(body)}
</article>`;
}

const version = JSON.parse(readFileSync(`${root}package.json`, "utf8")).version;
const releases = readReleases();
if (releases[0]?.version !== version) {
  console.error(`error: the newest CHANGELOG.md release is not the current version ${version}`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
cpSync(`${root}docs`, out, { recursive: true });

const index = readFileSync(`${out}/index.html`, "utf8")
  .replaceAll("{{VERSION}}", escape(version))
  .replace("<!-- CHANGELOG -->", releases.slice(0, RELEASES_SHOWN).map(releaseHtml).join("\n"));
writeFileSync(`${out}/index.html`, index);
console.log(`site v${version} built in ${out}`);
