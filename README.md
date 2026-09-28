# PDF Shelf

A local-first desktop app to organize, read and annotate your PDFs. Your files, reading
progress and notes never leave your machine.

## Stack

- [Tauri 2](https://tauri.app) (Rust) — file storage, SQLite database, PDF serving
- React + TypeScript + Vite — UI (in `ui/`)
- Tailwind CSS v4, pdf.js

## Install on Linux

Requires WebKitGTK 4.1 at runtime (`libwebkit2gtk-4.1-0` on Debian/Ubuntu). Building needs
Node 20+ and Rust stable.

```sh
scripts/install.sh              # build and install for your user (~/.local)
scripts/install.sh --system     # install for all users (/usr/local, sudo for copying only)
scripts/install.sh --skip-build # reuse an existing release build
```

PDF Shelf then appears in your applications menu. To remove it:

```sh
scripts/uninstall.sh            # removes the app, keeps your library
scripts/uninstall.sh --purge    # also deletes stored PDFs, notes and progress (asks first)
```

Use the same `--system` / `--prefix DIR` flag you installed with. Your library lives in
`~/.local/share/com.pdfshelf.app`.

## Development

Prerequisites: Node 20+, Rust stable, and the [Tauri system dependencies](https://tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev      # run the app
npm test               # frontend unit tests
npm run lint
cd src-tauri && cargo test   # backend tests
npm run tauri build    # production bundle
```

## Project layout

```text
ui/          React frontend (features, services, styles)
src-tauri/   Rust backend (db, storage, services, commands)
scripts/    Linux install/uninstall, pdf.js asset copy
assets/     App icon source (app-icon.svg)
PROGRESS.md  Implementation progress and development notes
```
