// Reads CHANGELOG.md (Keep a Changelog format).
//
// Usage: node scripts/changelog.mjs notes X.Y.Z   print that release's notes (markdown)
//                                                  fails if the release is not in the changelog
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const CHANGELOG = fileURLToPath(new URL("../CHANGELOG.md", import.meta.url));

/**
 * Released versions, newest first: `{ version, date, body }`, where `body` is the markdown
 * between the release heading and the next one. "Unreleased" and link definitions are skipped.
 */
export function parseReleases(text) {
  const releases = [];
  let current = null;
  for (const line of text.split("\n")) {
    const heading = line.match(/^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/);
    if (heading) {
      current =
        heading[1] === "Unreleased"
          ? null
          : { version: heading[1], date: heading[2] ?? "", lines: [] };
      if (current) releases.push(current);
    } else if (current && !/^\[[^\]]+\]: /.test(line)) {
      current.lines.push(line);
    }
  }
  return releases.map(({ lines, ...release }) => ({ ...release, body: lines.join("\n").trim() }));
}

export function readReleases() {
  return parseReleases(readFileSync(CHANGELOG, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, version] = process.argv.slice(2);
  if (command !== "notes" || !version) {
    console.error("usage: node scripts/changelog.mjs notes X.Y.Z");
    process.exit(1);
  }
  const release = readReleases().find((r) => r.version === version);
  if (!release) {
    console.error(`error: CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section`);
    process.exit(1);
  }
  console.log(release.body);
}
