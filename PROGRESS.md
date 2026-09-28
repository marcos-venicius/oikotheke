# Oikotheke — Progress

Living log of the v1 implementation. Keep it updated at the end of every work step.
Product spec and rules: `CLAUDE.md` (keep it updated when a change affects it). Everything (code, UI, commits, docs) is in English.

## Status

**Current phase:** EPUB support complete (phases 1–4) — awaiting user feedback
**Next step:** user reinstalls (`scripts/install.sh`; migrates their real DB to schema 3) and checks import errors via the picker. Candidate follow-ups (not started):
- Continuous-scroll reading mode (virtualized, reusing `PageRenderer`).
- Text layer (select/copy text) — pdf.js `TextLayer`, only for rendered pages.
- Sort/search on the shelf by title/author.
- Undo for note deletion; export notes (Markdown).
- AppImage/RPM bundles (need `rsvg2`/extra deps).

| # | Phase | Status |
|---|-------|--------|
| 0 | Scaffold (Tauri 2 + React/TS + Vite, Tailwind, lint, git) | ✅ done |
| 1 | Persistence core (Rust): errors, db + migrations, storage, repositories | ✅ done |
| 2 | Library backend: background import, remove/restore/delete, reconcile, `oikotheke://` protocol | ✅ done |
| 3 | UI shell + light/dark/system theme, router, settings | ✅ done |
| 4 | Library UI: grid, import queue cards, picker + drag-drop, covers, remove dialog | ✅ done |
| 5 | Reader: `oikotheke://` range protocol, windowed rendering, nav, zoom, keyboard | ✅ done |
| 6 | Reading progress: debounced autosave, flush on close, reopen at last page | ✅ done |
| 7 | Notes: CRUD, panel, indicators, annotated-page navigation | ✅ done |
| 8 | Book details page + polish (states, toasts, a11y, perf) | ✅ done |
| 9 | Hardening (corrupt/permission/disk full/crash) + `tauri build` | ✅ done |

## Verification log (2026-09-28)

- Rust: 32 tests (repositories, import success/failure incl. permission denied, abort, soft/permanent delete, reconcile, range parsing, error mapping). Frontend: 16 vitest tests (reader math, noted pages, debounce, format, title heuristics).
- Manual, in the real app: import (incl. 600 MB file, non-PDF rejected, truncated PDF rolled back), covers, reader nav/zoom/fit, progress restored after restart, notes create/navigate/indicators, details page, light/dark, soft remove + permanent delete (files freed), release build with CSP, crash leftovers cleaned on startup.

## README screenshots (2026-09-28)

- `docs/screenshots/*.png` (5 images, ~1.8 MB), captured from a dev build in a scratch XDG dir with a 1440×900 window. Library only with public-domain books: 13 Standard Ebooks EPUBs + *The Prince* printed to PDF from its single-page HTML with `google-chrome --headless=new --no-pdf-header-footer --print-to-pdf`. **Never use the user's books** (or other copyrighted covers) in screenshots.
- Recipe: import with `OIKOTHEKE_DEV_IMPORT`, resize with `XResizeWindow` (ctypes libX11), drive with the scratch `xt.py` (move/click/key incl. `ctrl+a`/type with Shift), capture with `import -window`, crop empty space, save with `convert -strip -define png:compression-level=9`. The keyboard layout is not US: XTest typing of `'` and `:` produces wrong characters — avoid them in typed text.
- Theme toggle cycles system → light → dark; the preference persists in the demo DB between runs.

## EPUB phase 4: notes (2026-09-28)

- `NotesPanel` is format-agnostic: props `here` ({key, label, notes, create}), `prev`/`next` ({label, go} | null), `groups` (`NoteGroup[]`), `currentGroup`, `onOpenGroup`. `useBookNotes` no longer computes PDF pages; `PdfReader` builds its props from `notedPages`/`adjacentNotedPage`, `EpubReader` from CFIs.
- `ui/lib/notes.ts`: `compareLocations`, `sortNotes`, `noteLabel`, `groupNotes` (PDF by page, EPUB by consecutive chapter label), `isWithin(point, rangeCfi)`, `rangeStart` — via foliate `epubcfi.js` `compare`/`collapse` (pure module). Tests with real CFI shapes.
- EPUB note location = `collapse(relocate.cfi)` (start of the visible range); label = `relocate.tocItem.label` (the chapter shown in the bottom bar — foliate picks it for the visible range, so it can be the next heading on the page). Notes "here" = `isWithin(note, visible range)`. Scrubber marks = `view.getSectionFractions()[view.resolveCFI(cfi).index]` (chapter start; approximate). Reader opens at `location.state.location` (details page) for both formats (PDF: `pdfPage`).
- Fixed on the way: dark-mode overrides lost to books' own `!important` rules (pandoc: `code.sourceCode > span { color: black !important }` made code invisible). Overrides now use `:not(#oikotheke):not(#oikotheke)` for id-level specificity. EPUB scrubber moved inside `<main>` so it doesn't run under the notes panel; notes-panel jump buttons capped at 42% width.
- Verified in the app (scratch data, the user's EPUB): create note, dot + mark, move away, "Previous" jumps back, details page (Format EPUB, no Pages, "7% read", note under its chapter) opens the reader at the note (7%) rather than the last position (8%); PDF notes still work (Page 29 note, jump from 31). Release build + hostile EPUB re-verified (no requests, no script, link dialog, Esc opens nothing). 37 vitest + 54 Rust.
- Gotcha (again): `pkill`-style patterns like `npm run tauri` also match your own `npm run tauri build` command and kill it — stop the dev app in a separate command.

## Book links (2026-09-28)

- User request: clicking a web link in a book asks for confirmation, then opens it in the system browser. `tauri-plugin-opener` 2.6 (official; pulls zbus/zvariant on Linux, ~580 Cargo.lock lines) with a capability scoped to `http://*`/`https://*` only (not `opener:default`, which adds mailto/tel/reveal). `services/linkService.ts` (`webUrl`, `openInBrowser`), `reader/OpenLinkDialog.tsx` (host + full URL, focus starts on Cancel). Non-web schemes get a toast.
- Reader shortcuts are ignored while a `<dialog open>` exists (`ignoresShortcuts`), so Esc closes the dialog without leaving the book.
- Verified with fake `xdg-open`/`gio` scripts first on `PATH` (they log the URL instead of launching the user's browser): Esc → nothing opened; Open link → exactly one `xdg-open http://127.0.0.1:8765/clicked-link`.

## EPUB phase 3: reader (2026-09-28)

- `ReaderPage` loads the book and picks `PdfReader` (former `ReaderPage`, `git mv`) or `EpubReader`. Shared: `readerChrome.ts` (`isTyping`, `useChromeVisibility`), `ReaderStatus.tsx`, `useProgressSaver.ts`. `useReaderDocument(book)` now takes the book. URL helpers + `fetchRange` moved to `services/bookFile.ts`.
- EPUB loading (`epubService.openEpub`): **@zip.js/zip.js 2.18** `ZipReader` over a `RangeReader extends Reader` (fetchRange through `oikotheke://`), fed to foliate-js `EPUB` via a custom loader. foliate's vendored zip.js can't be used for this: it doesn't export `Reader`, and zip.js needs a real subclass (it uses `reader.readable`). The user's EPUB opened with ~40 range requests, no full read.
- `EpubReader`: creates `<foliate-view>`, listens to `relocate` (fraction, cfi, tocItem → autosave `{location: cfi, progress, zoomMode: null}`), `load` (attach keydown/pointermove inside iframes — events there never reach the window), `external-link` (preventDefault + toast). Layout attributes `max-inline-size 720px`, `gap 7%`, `margin 56px`; `flow` paginated|scrolled. Prefs are global settings `epub.fontSize`/`epub.flow` (`useEpubPrefs`); the book opens only after prefs load.
- Theme: the paginator paints each section's computed background in its own layer at load time, so page color must go through `--theme-bg-color` (set on `html` in `contentCss`). Theme tokens are read in a `requestAnimationFrame`: ThemeProvider's effect (parent) runs after the reader's. Dark mode forces text color; only `img` gets a white backing (not `svg`: cover pages wrap the image in a full-width svg).
- **Security** (see CLAUDE.md "Book content is untrusted"): `tauri dev` applies **no CSP** — a hostile EPUB fetched remote CSS/JS/image/font/iframe from a logging `python3 -m http.server` in dev. Release with CSP only: zero requests, no script ran, but that hostile book failed to open (fails closed). Added `services/epubSanitize.ts` via foliate's `transformTarget` `data` event (jsdom-based tests). Release with CSP + sanitizer: hostile book opens, zero requests, no script. CSP additions: `frame-src blob:`, `style-src … blob:`, `font-src … blob:`.
- Verified in the app (scratch XDG, copy of the real library + the user's EPUB): open, flip, contents jump, chapter label, 120% font, dark theme, scrolled flow, leave + reopen at the same place (7%), shelf shows 7%, PDF reader still reopens at 29/601. 32 vitest tests, Rust unchanged (54).
- Hostile EPUB recipe (scratch `epubs/hostile.epub`): inline `<script>` turning the page red + `parent` outline, packaged `evil.js`, remote `<script src>`, `<link rel=stylesheet>`, `@font-face url()`, `<img>`, `<iframe>`, `<img onerror>`, external `<a>`; all pointing at `http://127.0.0.1:8765`.

## EPUB phase 2: import (2026-09-28)

- `src-tauri/src/epub.rs` (deps: `zip` 8 with only `deflate-flate2-zlib-rs`, `quick-xml` 0.42 — already in the tree): `is_epub` (ZIP magic + `mimetype` entry, position/compression not checked: the user's real EPUB has `EPUB/` as first entry), `read_package` (container → OPF → dc:title, dc:creator ×3, cover via `cover-image` → EPUB2 `<meta name="cover">` → id/file name containing "cover"), `read_cover`. Caps: XML entries 4 MB, cover 20 MB. DRM = `rights.xml` or a non-font-obfuscation `EncryptionMethod`. Truncated OPFs are rejected (depth check + root must be `package`; quick-xml doesn't error on unclosed tags at EOF).
- quick-xml 0.42 API: names are `&str` (`local_name().as_ref()`), text via `xml10_content()`, entities arrive as separate `Event::GeneralRef`, attribute values via `normalized_value(XmlVersion::Implicit1_0)`.
- Storage: `book_file(format)` → `book.pdf`/`book.epub`; `detect_format`. Protocol `book/<id>` resolves the file through the DB row. Errors: `unsupportedFormat` (was `notPdf`), `unreadable`, `drm`.
- Commands `read_epub_metadata` → `{ title?, author?, hasCover }`, `read_epub_cover` → raw bytes (`ipc::Response`). UI `importService.extractBook` dispatches per format; EPUB covers are decoded with `createImageBitmap` and re-encoded to JPEG (`services/coverImage.ts`, shared with pdf.js covers). `finalize_import` requires `pageCount ≥ 1` for PDF and `0` for EPUB, and strips control characters from title/author (found a real `"regression\0"` PDF title from ImageMagick; `pickTitle` cleans too).
- Reader: EPUB books show "Reading EPUB books is not available yet." (`useReaderDocument`).
- Verified: 54 Rust + 25 vitest (incl. `importService.test.ts` for EPUB extraction/error mapping); end-to-end in scratch XDG dirs with a copy of the user's real library + the user's EPUB ("Build Your Own Database From Scratch in Go": title, "James Smith", PNG cover → JPEG, "EPUB" label), a PDF (regression), a DRM EPUB and a broken EPUB (both rolled back, no rows/dirs left). Not seen on screen: the book details page for an EPUB, and failure toasts — `OIKOTHEKE_DEV_IMPORT` bypasses the UI job list, so failures of dev-queued imports are silent (real picker/drop imports register jobs).
- The user's sample EPUB sits untracked in the repo root — never commit it.

## EPUB phase 1: locations (2026-09-28)

- Migration 3: `books.format` (CHECK pdf|epub, default pdf), `books.location` (TEXT, null = start), `books.progress` (REAL 0..1, backfilled as current_page/page_count with page 1 = 0), `notes.location` + `notes.label`; `current_page`, `page_number` and `idx_notes_book_page` dropped (new `idx_notes_book`). `page_count` stays NOT NULL; 0 = unknown/EPUB (avoids a table rebuild).
- `services/location.rs` validates per format (PDF page within 1..=page_count when known; EPUB `epubcfi(…)` ≤ 4096 chars) — used by `services/progress.rs` (new; `save_progress` goes through it) and `services/notes.rs`. Progress saves are now **rejected** when invalid (the old SQL clamped pages).
- `list_notes` returns creation order; the UI sorts (PDF: by page in `notedPages.ts`). `create_note` takes `location` + optional `label` (trimmed, blank → null, cut at 200 chars).
- UI: `ui/lib/location.ts` (`pdfPage`/`pdfLocation`/`pdfProgress`) is the only PDF page↔location conversion; shelf and details read `book.progress`; `readingProgress()` removed.
- Verified: 44 Rust tests (incl. a v2→v3 migration test with notes, cascade and the format CHECK) + 19 vitest; end-to-end on a fresh copy of the user's real library in scratch XDG dirs (legacy dir + schema migrations in one start): shelf 5%, reader reopened at 29/601 in fit-height, page flip saved `location "30"`, a note saved at `"30"` with indicator dots.
- The user's real library was migrated to the Oikotheke dir by their own install (schema 2 at that time); schema 3 runs on their next install.

## Rename to Oikotheke (2026-09-28)

- PDF Shelf → **Oikotheke** (Greek *oîkos* + *thḗkē*, "home shelf"). Identifier `io.github.marcos-venicius.oikotheke` (Tauri identifiers allow `-` but not `_`; a Flathub id would need `marcos_venicius`), binary/crates `oikotheke`/`oikotheke_lib`, scheme `oikotheke://`, DB `oikotheke.db`, theme key `oikotheke:theme` (first launch may flash the default theme until the DB setting loads).
- `src-tauri/src/legacy.rs` migrates `<data-dir>/com.pdfshelf.app` → new dir and `pdf-shelf.db` → `oikotheke.db`, **before** `tauri::Builder` (log plugin + WebKit create the new dir early); the report is logged in `setup`. The DB is switched to `journal_mode=DELETE` first so WAL-only commits land in the main file; it refuses while another connection is open. `dirs::data_dir()` is the same base Tauri uses for `app_data_dir`.
- Verified: 7 unit tests (WAL-only data, idempotence, no merge, crash between steps, DB in use) and end-to-end on a copy of the user's real library in scratch XDG dirs (book, cover, 5% progress, light theme preserved; WM class `oikotheke`). Uninstall tested in a scratch prefix (removes old and new launcher files). `install.sh` legacy-launcher cleanup not run (needs a release build).
- The old installed `pdf-shelf` binary, if launched after migration, starts with an empty library under the legacy id; `install.sh` removes its launcher files.

## Linux install (2026-09-28)

- `scripts/install.sh` builds (`tauri build --no-bundle`) as the user, then installs binary, hicolor icons (32–512 + scalable SVG) and `oikotheke.desktop` into `~/.local` (default), `/usr/local` (`--system`, sudo only for copying) or `--prefix`. `--skip-build` reuses the release binary.
- `scripts/uninstall.sh` removes those files (same flags), refuses while the app runs, keeps the library unless `--purge` (typed `delete` confirmation, or `--yes`).
- Tested in a scratch prefix: desktop entry passes `desktop-file-validate`; window WM class is `oikotheke` (matches `StartupWMClass`) and `_NET_WM_ICON` is the new icon. Purge tested only against fake XDG dirs.
- Icon source: `assets/app-icon.svg`; regenerate with `npx tauri icon assets/app-icon.svg` and delete `src-tauri/icons/{android,ios}`. Preview with the Tauri renderer, not ImageMagick (it mis-renders gradients/transforms).
- Gotcha: under `set -o pipefail`, `cmd | grep -q` can fail via SIGPIPE; use `grep >/dev/null`.

## Decisions

- **Stack:** Tauri 2 + React 19 + TypeScript + Vite, npm. Rust owns files + SQLite; UI talks only through `ui/services/*`.
- **Frontend folder is `ui/`** (not `src/`), per user request. `index.html` at the root loads `/ui/main.tsx`. Alias `@/` → `ui/`.
- **Styling:** Tailwind v4 + CSS variable tokens; themes light / dark / system. Minimal, modern look.
- **Import is non-blocking:** background copy queue in Rust, progress via Tauri events; metadata + cover generated in the background by pdf.js.
- **Large PDFs:** served via custom `oikotheke://` scheme with HTTP Range; pdf.js with `disableAutoFetch`/`disableStream`; only current page + next 3 (+ prev 1) rendered, LRU eviction.
- **Integrity:** copy to `library/.staging-<id>` then rename; rows start as `importing`; startup reconcile cleans leftovers; permanent delete goes through `.trash-<id>`.
- **Remove:** "Remove from library" = soft delete (files kept, restorable). "Delete permanently" = files + notes gone. Never delete without explicit choice.
- **CSP** (tauri.conf.json): self + `oikotheke:`/`http://oikotheke.localhost` for img/connect, `wasm-unsafe-eval` for pdf.js decoders, `unsafe-inline` styles (inline style attributes). Tauri hashes the inline theme script at build time.
- DB paths are stored relative to the app data dir. Timestamps are unix millis (`i64`).
- **Range loading:** the UI uses pdf.js `PDFDataRangeTransport` (length = `book.fileSize`), fetching `oikotheke://…/book/<id>` with explicit `Range` headers. The protocol caps a range at 16 MB; a request without `Range` returns the whole file (only meant for covers).
- **Crash-resumable imports:** reconcile keeps `importing` rows whose file exists; the UI must re-run metadata + cover for them on startup. Rows without a file are dropped.
- **Reader:** `PageRenderer` (ui/features/reader/pageRenderer.ts) renders on demand and `retain()`s only the window (current + next 3 + prev 1, `renderWindow`), cancelling other renders, freeing canvases and calling `page.cleanup()`. Zoom unit: 1 = 100% (render scale = zoom × 96/72). `zoom_mode` column (migration 2): `fit-page` | `fit-width` | `fit-height` | `custom` (+ `zoom_level`). Fit height is literally edge to edge (no vertical padding: page top at y=0, bottom at window height).
- **Focus mode** (`useFocusMode`): window full screen via `setFullscreen` (needs `core:window:allow-set-fullscreen`); keys F/F11; Esc exits focus before leaving the reader; leaving the reader restores the window if the reader enabled full screen.
- WebKitGTK quirk: ResizeObserver doesn't report padding-only changes, so `PageView` observes the outer client size and subtracts the per-mode padding itself.
- The reader accepts `navigate(`/read/${id}`, { state: { page } })` to open at a given page (used by book details notes).
- **Progress:** `progressService.createSaver` debounces 400 ms; flushed on reader unmount and `onCloseRequested` (needs `core:window:allow-destroy`).
- Cover is JPEG (`cover.jpg`), generated by pdf.js in the UI and sent via raw-body IPC (`save_cover`, `book-id` header).

## Known issues / TODO

- Two app instances (e.g. installed + `tauri dev`) share one database and overwrite each other's reading state. Consider `tauri-plugin-single-instance`.

- pdf.js walks the whole page tree on open (`checkLastPage`), touching one 64 KB chunk per page object. Measured on a synthetic 600 MB / 600-page file: ~38 MB read on open (x2 in dev due to StrictMode double effects), then **0 bytes** for page turns and jumps. Real PDFs usually cluster page objects, so it's typically far less.
- pdf.js allocates a `Uint8Array(fileSize)` per open document; it's virtual memory, only fetched chunks become resident.

- Cover rendering runs on the main thread (canvas); fine for one page, could move to OffscreenCanvas later.

- `rsvg2` missing: `.deb` bundles fine (`npm run tauri build -- --bundles deb`, 5.6 MB); AppImage not tried.

## Notes for AI

### Backend map (`src-tauri/src`)
- `error.rs` AppError → `{ kind, message }` (kinds: notFound, notPdf, permissionDenied, diskFull, invalid, database, io)
- `db/` repositories as free functions over `&Connection`; `Database::conn()` returns the mutex guard
- `storage/` layout + `copy_file` (1 MB chunks, fsync) + `write_atomic`; ids validated as UUID
- `services/library.rs` import copy/finalize/abort, soft remove, permanent delete via `.trash-<id>`
- `services/reconcile.rs` startup repair; `import.rs` worker thread + events `import:progress|copied|failed`
- `protocol.rs` `oikotheke://localhost/{book|cover}/<id>` (use `convertFileSrc("book/<id>", "oikotheke")`)
- Notes: `services/notes.rs` validates (trimmed, non-empty, ≤ 20k chars, location valid for the book via `services/location.rs`). Commands list_notes, create_note(bookId, location, label?, content), update_note, delete_note.
- Progress: `services/progress.rs` validates location + progress (0..1) before `db::books::update_progress`.
- Commands: list_books, list_removed_books, get_book, import_books, save_cover, finalize_import, abort_import, remove_book, restore_book, delete_book, get_settings, set_setting

- Commits: Conventional Commits, English. Remote `origin` = `marcos-venicius/oikotheke` (private); push only when the user asks. **Never add `Co-Authored-By` or any AI attribution.**
- Library versions are recent (pdfjs-dist 6, react-router 8, vitest 5, TypeScript 6, ESLint 10): check `node_modules/*/` typings before assuming APIs.
- TS 6: `baseUrl` is deprecated — use relative `paths` only.
- Commands: `npm run tauri dev`, `npm test`, `npm run lint`, `npm run typecheck`, `cd src-tauri && cargo test`.
- First `cargo check` takes ~2 min (webkit2gtk crates).
- **Manual testing without clicking:** debug builds read `OIKOTHEKE_DEV_IMPORT=a.pdf:b.pdf` and queue those files 3 s after startup. Run with `GDK_BACKEND=x11 npm run tauri dev` so the window is an X11 client, then screenshot with `import -window $(xwininfo -root -tree | grep '"Oikotheke"' | awk '{print $1}') out.png` (root-window capture fails on Wayland). There is no xdotool, so clicks can't be automated.
- **Driving the UI:** match the main window by size (`grep ' 1200x'`) — tooltips are also X windows titled "Oikotheke". A scratch `xt.py` uses XTest via ctypes (`libXtst.so.6`) to click/move/press keys/type relative to the window (the first click may only focus the window; click again) (the user may be using the app at the same time — check with a screenshot first). Debug builds log every `oikotheke` range request (`grep "oikotheke range" dev.log`) to verify partial loading.
- Stopping the dev app: don't `pkill -f` with a pattern that also matches your own shell command; use `ps -eo pid,args | grep "[t]arget/debug/oikotheke"`.
- Tauri dev restarts the app on every Rust change; with `OIKOTHEKE_DEV_IMPORT` set that re-imports (duplicates). Start without it once data exists.
- Test PDFs: generate them (a scratch `genpdf.py` wrote N-page PDFs with optional random filler streams to make ~600 MB files). Never use the user's own PDFs.
- App data (Linux): `~/.local/share/io.github.marcos-venicius.oikotheke/` (`oikotheke.db`, `library/`, `logs/`). No `sqlite3` CLI installed (use Python's `sqlite3` on a *copy*).
- **The user has a real library (books, progress) in the app-data dir.** Never run the dev app, tests or migrations against it: set `XDG_DATA_HOME`/`XDG_CACHE_HOME`/`XDG_CONFIG_HOME` to a scratch dir, and back it up (`cp -a`, with `-wal`/`-shm`) before anything risky.
- `public/pdfjs` is generated by `scripts/copy-pdfjs-assets.mjs` (predev/prebuild) and gitignored.

### Frontend map (`ui/`)
- `styles/index.css` design tokens (`--bg`, `--surface`, `--surface-2`, `--text`, `--muted`, `--border`, `--accent`, `--danger`, `--reader-bg`) mapped to Tailwind colors (`bg-surface`, `text-muted`, …). Dark = `[data-theme="dark"]` on `<html>`; `dark:` variant is wired to it.
- `app/theme.tsx` ThemeProvider (preference in DB `settings.theme`, cached in localStorage `oikotheke:theme`, applied pre-paint by the inline script in `index.html`).
- `services/ipc.ts` `call()` wraps `invoke` and throws `AppError { kind }`; `describeError()` for user messages.
- `components/` Button, IconButton, ThemeToggle. `lib/cn.ts` class joiner.
- Routes (MemoryRouter): `/` library, `/book/:id` details, `/read/:id` reader.
