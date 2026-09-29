// The app version lives in five files that must agree. This script checks and changes them.
//
// Usage: node scripts/version.mjs            print the version (fails if the files disagree)
//        node scripts/version.mjs set X.Y.Z  set the version everywhere
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const read = (path) => readFileSync(root + path, "utf8");
const write = (path, text) => writeFileSync(root + path, text);

// Each file: how to read its version and how to replace it.
const files = {
  "package.json": {
    get: (text) => JSON.parse(text).version,
    set: (text, v) => text.replace(/^(  "version": )"[^"]*"/m, `$1"${v}"`),
  },
  "package-lock.json": {
    get: (text) => JSON.parse(text).version,
    // The root version and the root package entry ("packages" → "").
    set: (text, v) =>
      text
        .replace(/^(  "version": )"[^"]*"/m, `$1"${v}"`)
        .replace(
          /("packages": \{\s*"": \{\s*"name": "oikotheke",\s*"version": )"[^"]*"/,
          `$1"${v}"`,
        ),
  },
  "src-tauri/tauri.conf.json": {
    get: (text) => JSON.parse(text).version,
    set: (text, v) => text.replace(/^(  "version": )"[^"]*"/m, `$1"${v}"`),
  },
  "src-tauri/Cargo.toml": {
    get: (text) => text.match(/^\[package\][^[]*?^version = "([^"]*)"/ms)?.[1],
    set: (text, v) => text.replace(/^(\[package\][^[]*?^version = )"[^"]*"/ms, `$1"${v}"`),
  },
  "src-tauri/Cargo.lock": {
    get: (text) => text.match(/^name = "oikotheke"\nversion = "([^"]*)"/m)?.[1],
    set: (text, v) => text.replace(/^(name = "oikotheke"\nversion = )"[^"]*"/m, `$1"${v}"`),
  },
};

function versions() {
  return Object.entries(files).map(([path, f]) => [path, f.get(read(path))]);
}

const [command, arg] = process.argv.slice(2);

if (command === "set") {
  if (!arg || !SEMVER.test(arg)) {
    console.error(`error: "${arg ?? ""}" is not a SemVer version (X.Y.Z)`);
    process.exit(1);
  }
  for (const [path, f] of Object.entries(files)) {
    write(path, f.set(read(path), arg));
  }
}

if (command && command !== "set") {
  console.error(`error: unknown command "${command}"`);
  process.exit(1);
}

const found = versions();
const distinct = new Set(found.map(([, v]) => v));
if (distinct.size !== 1 || !SEMVER.test([...distinct][0] ?? "")) {
  console.error("error: the version files disagree:");
  for (const [path, v] of found) console.error(`  ${path}: ${v}`);
  process.exit(1);
}
console.log([...distinct][0]);
