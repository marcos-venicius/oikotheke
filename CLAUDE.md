# Oikotheke

## Keeping this file current

**This file is the source of truth for the product and its rules. Whenever a change affects
anything described here — product behavior, scope, data model, storage layout, architecture,
stack, conventions or principles — update this file in the same change.** Do not let it drift
from the code. Implementation details, progress and gotchas go in `PROGRESS.md` (see
[Development](#development)); product-level decisions and rules go here.

## Overview

**Oikotheke** is a desktop application to organize, read and annotate books locally. It reads and
annotates PDF and EPUB books (see [Formats](#formats)).

It works as a **digital bookshelf**: the user imports books, organizes the library and opens
any document in a book-like reading experience.

### Name

*Oikotheke* comes from Greek οἶκος (*oîkos*, "house, home") + θήκη (*thḗkē*, "case,
repository") — the same *thḗkē* as in βιβλιοθήκη, "library". It means "the home shelf": a
personal library that lives with you. The project was called **PDF Shelf** until the rename.

| Use | Value |
|---|---|
| Display name (window, menu, README) | `Oikotheke` |
| Binary, npm and Cargo package, desktop entry | `oikotheke` |
| App identifier (sets the app-data dir) | `io.github.marcos-venicius.oikotheke` |
| Internal URI scheme | `oikotheke://` |
| Legacy identifier (migrated on startup) | `com.pdfshelf.app` |

The core principle is **local-first**:

- All files stay on the user's machine.
- No PDF is ever uploaded to a server.
- Library information, reading progress and notes are stored locally.
- The application works fully offline. The only exception is a Discover import, which the user
  starts explicitly (see [Network access](#network-access)).

**Status:** version 1.2.0 (see `CHANGELOG.md`). v1 is complete (library, reader, progress, notes, book details, hardening, Linux
install) and renamed to Oikotheke. PDF and EPUB are fully supported (import, reading,
progress, notes). Discover offers 30 free books to download and import.

## Goals

The user must be able to:

1. Import PDFs into the library.
2. Keep an app-owned copy of each PDF inside app-managed storage.
3. See all PDFs in a shelf-like library.
4. Open a PDF in an optimized reading interface.
5. Resume reading automatically where they left off.
6. Add notes tied to specific pages.
7. Review and edit notes later.
8. Manage the library without any external service.

## Product principles

### Local-first

Data belongs to the user and stays on the local machine.

Do not assume any of:

- Remote backend.
- User account.
- Login.
- Cloud sync.
- PDF upload.
- External storage services.

Any future sync feature must be additive and never required for basic use.

### Network access

The app goes online for one thing only: **downloading a Discover book the user chose to
import**. Rules:

- Only on an explicit click; never in the background, never to list the catalog.
- Only URLs bundled in the app (`src-tauri/catalog.json`). The UI asks by catalog id and never
  sees or chooses a URL.
- Done by Rust (`download.rs`, ureq + rustls), HTTPS on every hop (redirects capped at 5),
  200 MB cap enforced while streaming, timeouts. The request carries no cookies and nothing
  about the user or library (only `User-Agent: Oikotheke/<version>`).
- The webview never reaches the network: the CSP is unchanged.
- A downloaded file is as untrusted as a picked one: it goes through the same import pipeline
  (format detection on the staged copy, DRM/damage checks, sanitizer when read).

Any new network use needs an explicit product decision recorded here.

### File preservation

On import, the app **copies the file into its own managed directory**:

```text
User imports:
~/Downloads/book.pdf

The app copies it to:
<app-data>/library/<book-id>/book.pdf
```

After import the user may move, rename or delete the original, and the managed copy keeps
working. The app always works with its own copy after import.

## Library

The main screen is a digital bookshelf. Each imported PDF is a book/document.

Each library item shows at least:

- Cover/thumbnail.
- Title.
- Basic document info.
- Reading progress.
- A visual indicator when the book has notes.
- A way to open the book.

The layout must feel like a library, not a plain file list.

Books are ordered by **most recent activity** (`updated_at`), then by import date: opening a
book (the reader saves its position right away), reading, writing/editing/deleting notes,
importing and restoring all count. The book details page shows the same value as "Last
activity".

### Import

Users import PDF and EPUB books through:

- A file picker.
- Drag and drop, where the platform supports it.

Import flow:

1. Detect the format by content, never by extension: PDF = `%PDF-` signature within the first
   1024 bytes; EPUB = ZIP with a `mimetype` entry containing `application/epub+zip` (its
   position and compression are not checked — real files often break that rule).
2. Generate a unique book id (UUID).
3. Copy the file to `library/.staging-<id>/book.<pdf|epub>` on a background worker, reporting
   progress and computing its SHA-256 on the way (no extra read).
4. Refuse duplicates: if a book with the same content is already in the library (under any
   file name, including soft-removed books), delete the staging copy and report
   "“Title” is already in your library". Books imported before hashes existed get theirs
   computed on demand, only when their size matches. A book marked `missing` never counts —
   importing it again is how its file is recovered.
5. Atomically move it into `library/<id>/` and create the book row with status `importing`.
6. Extract metadata per format — PDF: title, author and page count with pdf.js; EPUB: title,
   author and cover image from the package document (OPF), read by the backend (`epub.rs`).
7. Make a JPEG cover (`cover.jpg`, 480 px wide at most) — PDF: render page 1; EPUB: re-encode
   the declared cover image. A missing cover is never fatal.
8. Clean the metadata (control characters, whitespace) and mark the book `ready`.

Damaged books are rolled back with a clear message. EPUBs protected by DRM (`rights.xml`, or
any `encryption.xml` algorithm other than font obfuscation) are rejected the same way.

Import must handle large files and never load a whole book into memory unnecessarily (EPUB
reads touch only the ZIP directory and small, size-capped entries). The UI must never block
while files are copied.

### Discover

`/discover` lists 30 hand-picked, freely licensed books bundled with the app
(`src-tauri/catalog.json`): 10 Portuguese classics (Project Gutenberg), 10 English classics
(Standard Ebooks) and 10 technical books for programmers (official author/publisher files).
Each entry has id, title, author, year, language, category (`classic` | `technical`), format,
URL (never sent to the UI), source, license and description.

- Shelves (All, Portuguese classics, English classics, Technical) and an accent-insensitive
  title/author search (`ui/lib/catalog.ts`).
- Typographic covers only: opening Discover makes no request.
- "Import" queues a download job in the same import queue as files (`import_from_catalog`):
  the body is streamed into staging with progress, then the normal import continues. The book
  keeps the catalog's title and author (embedded metadata may use old spellings), and its
  `catalogId` links it to the entry: Discover shows "Open" for books on the shelf, a hint for
  removed ones, and refuses to download a book already in the library (a book whose file is
  `missing` can be downloaded again). The hash check still catches the same file picked by hand.
- The book page shows the entry's source and license.
- Only books that may be downloaded freely from an official source qualify. Check the license on
  the official page before adding one; run the ignored test
  `cargo test catalog_downloads -- --ignored` after changing URLs (it downloads all of them).

### Removal

Removal offers two explicit, distinct actions:

- **Remove from library** — soft delete: the book is hidden, files and notes are kept, and it
  can be restored.
- **Delete permanently** — the book row, its notes and its files are deleted (via
  `library/.trash-<id>` so a crash cannot leave a half-deleted book).

Never delete files without an explicit user action.

## Storage

The app separates:

1. **Binary files** — PDFs, covers and other derived assets, on disk.
2. **Metadata** — books, reading progress, notes and settings, in a SQLite database.

Layout (under the platform app-data dir, e.g.
`~/.local/share/io.github.marcos-venicius.oikotheke/` on Linux):

```text
<app-data>/
├── library/
│   └── <book-id>/
│       ├── book.pdf | book.epub
│       └── cover.jpg
├── logs/
└── oikotheke.db
```

- Paths stored in the database are relative to the app-data dir.
- Timestamps are Unix milliseconds.
- Never hardcode OS-specific paths; use the directories provided by the framework.

### Legacy data migration

Users of PDF Shelf have their library under the legacy identifier. On startup, **before Tauri
initializes** (plugins and the webview create the new data dir early), the app:

1. Renames `<data-dir>/com.pdfshelf.app` to `<data-dir>/<identifier>` — only when the legacy
   dir exists and the new one does not. It is a single atomic rename; the dirs are never
   merged and nothing is copied or deleted.
2. Renames `pdf-shelf.db` to `oikotheke.db` — only when the new file does not exist. The WAL
   is checkpointed into the main file first (the `-wal` file may hold most recent writes), and
   the rename happens only if the checkpoint fully succeeds; the emptied legacy `-wal`/`-shm`
   are removed afterwards.

Both steps are idempotent and safe to interrupt: a crash leaves either the old or the new
state, and the next start finishes the job. A migration failure is logged and never deletes
data. This migration stays until all known installs have run it at least once.

## Reader

Opening a book enters a book-like reading experience. `ReaderPage` loads the book and hands it
to the reader for its format; both share the chrome (toolbar and progress bar that fade while
reading, focus mode, loading/error states) and the progress autosave.

Reading comfort comes first: keep visible controls to a minimum.

### PDF reader

The PDF reader:

- Shows one page at a time, sized to the window.
- Navigates forward/back (buttons, keyboard, page scrubber).
- Jumps directly to a page.
- Shows the current page and total page count.
- Supports zoom and fit modes: fit page, fit width, fit height, custom zoom. Zoom in/out also
  with +/− (with or without Ctrl) and Ctrl + mouse wheel.
- Has a focus mode (full screen, minimal chrome).
- Returns to the library/book page.

Large files are streamed: the PDF is served through the `oikotheke://` protocol with HTTP
Range requests, and only a small window of pages around the current one is rendered.

### EPUB reader

EPUBs reflow, so there are no fixed pages. The EPUB reader uses
[foliate-js](https://github.com/johnfactotum/foliate-js) (MIT) and:

- Lays the text out as book-like pages (two columns on wide windows) or as a continuous
  scroll per chapter.
- Navigates forward/back (buttons, keyboard), through the table of contents, or by dragging the
  percentage bar, which also shows the current chapter.
- Changes the font size (80–200%), also with +/− (with or without Ctrl) and Ctrl + mouse wheel.
- Follows the app theme: pages take the app background; dark mode forces readable text.
- Has the same focus mode and returns to the library.

Font size and layout are app-wide preferences (`epub.fontSize`, `epub.flow` in settings), not
per book. The book is read through the `oikotheke://` protocol with HTTP Range requests
(zip.js), so only the ZIP directory and the chapters being shown are fetched.

## Reading progress

Progress is saved automatically — the user never clicks "Save". Per book we store:

```text
location   last position (see Locations): a page for PDF, a CFI for EPUB
progress   0..1, shown on the shelf and the book page
zoomMode   PDF: fit-page | fit-width | fit-height | custom (null for EPUB)
zoomLevel  PDF: used when zoomMode = custom
```

Expected behavior:

1. The user opens a book.
2. The reader opens at the last saved position.
3. Progress is saved (debounced) while reading.
4. On leaving the reader or closing the window, the latest position is flushed to disk.

The backend validates every saved position against the book's format (`services/location.rs`)
and rejects invalid ones instead of storing them.

## Notes

Users create notes tied to a location. A location can have multiple notes.

Inside the reader (N opens the notes panel) the user can:

- Create a note on the current page.
- See the current page's notes.
- Edit and delete notes.
- See which pages have notes (a dot on the notes button, marks on the progress bar), and jump
  to the previous/next annotated place.
- See all notes of the book in reading order and jump to any of them.

What "the current page" means depends on the format:

| | PDF | EPUB |
|---|---|---|
| A note's location | the page | the start of the text on screen when it was written (CFI) |
| Notes of the current page | notes on that page | notes whose location is in the text on screen |
| Label | "Page 42" | the chapter shown when it was written |
| Grouped by | page | consecutive chapter |
| Progress-bar marks | exact page | start of the note's chapter (approximate) |

EPUB pages depend on window and font size, so a note may show up one page earlier or later
after the layout changes; it is always on the page that contains its location.

The shared `NotesPanel` knows nothing about formats: each reader passes what "here" is, the
previous/next annotated place and the groups. Ordering and grouping live in `ui/lib/notes.ts`.

Notes are persisted automatically. Content is trimmed, non-empty and at most 20,000
characters; the location must be valid for the book (for PDF, a page within its range). An
optional label (at most 200 characters) is captured at creation for formats whose locations
are not human-readable. The backend returns notes in creation order; ordering by location is
format-specific and done in the UI.

The book details page lists a book's notes, grouped the same way, and opens the reader at a
note's exact location (`navigate("/read/<id>", { state: { location } })`).

## Data model

### Locations

A PDF has fixed pages. An EPUB reflows: a "page" depends on window size and font size, so page
numbers are not stable positions. Every position is therefore stored as an opaque
**location** string, interpreted by the book's format:

| Format | `location` | Shown to the user as |
|---|---|---|
| pdf | page number (`"42"`) | "Page 42 of 300" |
| epub | EPUB CFI (`"epubcfi(/6/14!/4/2/1:0)"`) | chapter title + percentage |

Validation lives in `src-tauri/src/services/location.rs`; the UI converts PDF pages to and from
locations only in `ui/lib/location.ts`.

### Book

```text
Book
├── id           UUID
├── format       pdf | epub
├── title
├── author?
├── filePath     relative to app-data
├── coverPath?   relative to app-data
├── pageCount    PDF only; 0 when unknown (importing, or EPUB)
├── location?    last reading position; null = start of the book
├── progress     0..1
├── zoomMode?    PDF view setting
├── zoomLevel?   PDF view setting
├── fileSize     bytes
├── contentHash? SHA-256 of the file, backend only (duplicate detection); null until needed
├── status       importing | ready | missing
├── catalogId?   Discover entry the book was downloaded from; null for the user's own files
├── removedAt?   set when soft-removed
├── createdAt
├── updatedAt
└── noteCount    (computed, not stored)
```

### Note

```text
Note
├── id
├── bookId       (cascade delete with the book)
├── location
├── label?       display text captured at creation (e.g. a chapter title); null for PDF
├── content
├── createdAt
└── updatedAt
```

### Settings

Key/value pairs: `theme` (light | dark | system), `epub.fontSize` (percent), `epub.flow`
(paginated | scrolled).

Schema changes go through append-only migrations (`src-tauri/src/db/migrations.rs`); never
edit an existing migration. Migration 3 replaced `books.current_page` and
`notes.page_number` with locations, losslessly; migration 4 added `books.content_hash`;
migration 5 added `books.catalog_id`.

## Formats

PDF and EPUB share everything except the reader engine: library, storage, import queue,
removal, reconcile, book details, notes and progress. Format-specific code lives behind small
interfaces (`ui/lib/location.ts`, `ui/lib/notes.ts`, `services/location.rs`, the import
extractors, the readers), never as `if (format === …)` scattered across screens. The readers
are separate components (`PdfReader`, `EpubReader`) chosen once by `ReaderPage`; each reports
location changes to the shared autosave and builds the notes panel's data.

Adding a format means: detection and storage (`storage::detect_format`), an import extractor,
location validation, a reader, and the note ordering/labels — plus a check against this file.

## Data integrity

The database and the files on disk must never disagree — e.g. no book row pointing at a
missing PDF. Import, removal and updates must tolerate failure mid-operation.

Handled cases:

- Corrupt PDF (import is rolled back).
- Copy failure, unreadable file, permission denied, disk full.
- A managed PDF removed or corrupted inside app storage (book marked `missing`).
- Unexpected crash during an operation: on startup a reconcile step cleans staging/trash
  leftovers, drops rows without files, and resumes interrupted imports.

## Privacy

By default, book content and notes stay local. Never send to any server:

- PDFs or their content.
- Notes.
- Reading history.
- Personal library metadata.

No analytics, telemetry or external services without an explicit product decision. The
release build ships with a strict CSP. The only network access is a user-started Discover
download (see [Network access](#network-access)).

### Book content is untrusted

EPUB content is HTML/CSS and may contain scripts or references to the network. It must never
run code or reach the network. Iframe sandboxing can't help: foliate-js needs `allow-scripts`
because of a WebKit bug, and serves chapters as same-origin `blob:` URLs. Two independent
layers enforce it instead:

1. **CSP** (release builds): `script-src 'self'` (no inline, no `blob:`), `frame-src blob:`,
   and no remote origin in any directive. `blob:` chapter documents inherit it.
2. **Sanitizer** (`ui/services/epubSanitize.ts`, all builds): every (X)HTML, SVG and CSS
   resource is cleaned before it is displayed — scripts, `on*` handlers, iframes/objects,
   `<base>`, meta refresh, and every remote URL in resource attributes and CSS are removed.
   foliate-js already drops packaged scripts.

Links to websites (`http`/`https` only) open in the system browser, never inside the app, and
only after the user confirms a dialog that shows the real destination (host first — link text
can say anything). Other schemes are refused. The opener permission is scoped to `http://*`
and `https://*` (`capabilities/default.json`); don't widen it to `opener:default`. `tauri dev` does **not**
apply the CSP, so only the sanitizer protects dev builds. Any change to the reader, the CSP or
the sanitizer must be re-verified with a hostile EPUB (inline, packaged and remote scripts,
`onerror`, remote image/CSS/font/iframe, external link) against a local server that logs
requests, in a release build: no request may reach the server and no script may run; the
external link must only open after confirmation.

## UX

The interface is built around three areas:

```text
Library   → discovery and organization
   ↓
Book      → document info, progress and notes
   ↓
Reader    → reading, navigation and notes
```

Routes: `/` library, `/discover` free books, `/book/:id` details, `/read/:id` reader. Light,
dark and system themes. Avoid excess controls while reading; secondary tools live in toolbars, panels or menus.

## Architecture

Business logic must not be coupled to the UI:

```text
UI (ui/features)
├── Library
├── Discover
├── Book Details
└── Reader
        │
        ▼
Application services (ui/services → Tauri commands → src-tauri/src/services)
├── Library service (import, remove, restore, delete, reconcile)
├── Catalog + download (Discover: bundled catalog, HTTPS download into the import queue)
├── PDF service (pdf.js: metadata, covers, rendering)
├── EPUB service (backend: detection, metadata, cover; UI: foliate-js loading, sanitizer)
├── Reading progress service
└── Notes service
        │
        ▼
Persistence (Rust)
├── SQLite database (src-tauri/src/db)
└── Local file storage (src-tauri/src/storage)
```

- Rust owns all file and database access. The UI talks to it only through `ui/services/*`.
- UI components never manipulate files or the database directly.

## Stack

- **Tauri 2** (Rust): storage, SQLite (rusqlite), import queue, `oikotheke://` protocol;
  **ureq** (rustls, webpki roots) for Discover downloads.
- **React 19 + TypeScript + Vite** in `ui/` (not `src/`); alias `@/` → `ui/`.
- **Tailwind CSS v4** with CSS-variable design tokens; **pdf.js** for PDF parsing/rendering;
  **foliate-js** + **@zip.js/zip.js** for EPUB reading (`zip` + `quick-xml` in Rust for import);
  react-router (MemoryRouter); lucide-react icons; `tauri-plugin-opener` for confirmed web
  links. jsdom is a test-only dependency (DOM tests).

Dependency versions are recent (pdfjs-dist 6, react-router 8, TypeScript 6, ESLint 10,
vitest 5): check the installed typings in `node_modules` before assuming an API.

## Non-functional requirements

### Performance

- The library opens fast even with many books; it never loads full PDFs.
- Covers load on demand.
- File copies are asynchronous.
- The reader never reloads the whole PDF when changing pages.

### Offline

All core features work fully offline. Discover lists its books offline; only importing one
needs a connection.

### Cross-platform

Use the framework's filesystem and platform-directory APIs; no hardcoded paths. Linux is the
primary tested platform (`scripts/install.sh` / `scripts/uninstall.sh`). Windows is
distributed as an installer built by CI (see [Versioning and releases](#versioning-and-releases)). On Linux the window
class (X11 `WM_CLASS`, Wayland `app_id`) must be `oikotheke`, the desktop entry's name, or
window switchers show no icon; it is set in `setup()` before the main window is created.

## Website

A static landing page lives in `docs/` (`index.html`, `site.css`), reusing `docs/screenshots`.
`scripts/build-site.mjs` (`npm run site`) builds it into `site-dist/`, filling in
`{{VERSION}}` and the latest `CHANGELOG.md` releases (`<!-- CHANGELOG -->`); the release
workflow deploys it to GitHub Pages (source: GitHub Actions). Like the app, it makes no
external requests (no web fonts, analytics or CDNs). Keep its features and install steps in
line with the README.

## Versioning and releases

The app follows [Semantic Versioning](https://semver.org). **Every change that reaches `main`
must decide whether it bumps the version, and bump it in the same change:**

- **MAJOR** (`2.0.0`) — incompatible changes: data or library layout that older versions can't
  read, removed features, changed install paths.
- **MINOR** (`1.1.0`) — new user-facing features, backwards compatible (e.g. a new format).
- **PATCH** (`1.0.1`) — bug fixes and small, compatible improvements.
- No bump — changes users don't get: docs, tests, CI, refactors without behavior change.

The version lives in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`,
`src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`. Never edit it by hand: run
`node scripts/version.mjs set X.Y.Z` (`node scripts/version.mjs` checks that all agree).

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com): every user-visible
change adds a line under `## [Unreleased]` (Added, Changed, Fixed, Removed, Security), written
for users, not developers. On a bump, rename that section to `## [X.Y.Z] - YYYY-MM-DD`, start a
new empty `## [Unreleased]`, and update the compare links at the bottom.

On every push to `main`, `.github/workflows/release.yml`:

1. Fails if the version files disagree or `CHANGELOG.md` has no section for the version.
2. If the tag `vX.Y.Z` does not exist yet, builds the installers (Windows: NSIS,
   `Oikotheke-windows-x64-setup.exe`, per-user) and runs the backend tests on that platform.
3. Only when every installer built, creates the tag with a GitHub release whose notes are that
   changelog section and whose assets are the installers, marked **latest** (pre-releases such
   as `1.1.0-beta.1` are marked pre-release instead). A failed build releases nothing; fix it
   and push again.
4. Rebuilds and deploys the website with the current version and changelog (skipped while a
   new version's release is missing, so download links never break).

Installer asset names are stable (no version) so the website and README link to
`releases/latest/download/<name>`; keep the name in the workflow, the website and the README in
sync. Running the workflow by hand on another branch (`gh workflow run release.yml --ref
<branch>`) only builds the installers, as a dry run.

## Scope

### Delivered in v1

- Library: import (picker + drag and drop), managed copy, shelf with covers and titles,
  progress and note indicators, remove/restore/delete permanently.
- Book details page.
- Reader: navigation, jump to page, zoom and fit modes, focus mode, autosave and resume.
- Notes: create, edit, delete, per-page view, indicators, annotated-page navigation.

### Delivered after v1

- Rename to Oikotheke, with automatic migration of existing libraries.
- EPUB: import (metadata, cover, DRM/damage checks), reader (pages or scroll, contents, font
  size, theme), progress and resume, notes — with the same flow as PDF.
- Web links in books open in the browser after confirmation.
- Versioning (SemVer, changelog), GitHub releases and the website (1.0.0).
- Windows installer, built and attached to each release by CI (1.1.0).
- Discover: 30 free books downloaded from official sources into the library (1.2.0).

### Out of scope (for now)

- Cloud sync, sync across devices.
- Login, user accounts.
- Sharing, marketplace, social features.
- OCR.
- Automatic translation, AI summarization.
- Advanced highlights.
- Editing PDF content or advanced metadata.
- Complex tagging.
- DRM.

These may come later but must not add complexity to the core. Candidate follow-ups are
tracked in `PROGRESS.md`.

## Development

- `PROGRESS.md` is the living implementation log: status, decisions, known issues, backend
  and frontend maps, and testing tips. Read it before non-trivial work and keep it updated
  at the end of every work step.
- Commands: `npm run tauri dev`, `npm test`, `npm run lint`, `npm run typecheck`,
  `cd src-tauri && cargo test`.
- Everything (code, UI text, commits, docs) is written in English.
- Versioning: SemVer with a changelog, see [Versioning and releases](#versioning-and-releases).
- Commits: Conventional Commits. The repository is `marcos-venicius/oikotheke` (public,
  GitHub; website at <https://marcos-venicius.github.io/oikotheke/>); **push only when the user asks**. **Never add `Co-Authored-By` or any AI
  attribution** to commits or PRs.
- License: MIT (`LICENSE`). New dependencies must have a compatible license.
- Never use the user's own PDFs for testing; generate test files.

### Guidelines

Prefer simplicity, modularity and maintainable code. Before implementing a feature:

1. Understand the data model it needs.
2. Decide where the logic lives.
3. Avoid duplicating logic across screens.
4. Prefer native APIs and mature libraries.
5. Keep local storage as the source of truth.
6. Don't add external dependencies without need.

When adding a feature, check its impact on:

- Persistence.
- File integrity.
- Reading progress.
- Reader performance.
- Cross-platform compatibility.
- Data privacy.
- The version and `CHANGELOG.md`.
- **This file** — update it if the feature changes anything described here.

## Main success criterion

The core flow must work reliably for PDF and EPUB, including across app restarts:

```text
Import a PDF or EPUB
    ↓
The file is copied into app storage
    ↓
Book appears in the library
    ↓
User opens the book and reads
    ↓
App saves the current position automatically
    ↓
User adds notes to pages
    ↓
User closes the book and reopens it
    ↓
Book returns to the last position read, notes still available
```
