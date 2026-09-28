# PDF Shelf

A local-first desktop app to organize, read and annotate your PDFs. Your files, reading
progress and notes never leave your machine.

## Stack

- [Tauri 2](https://tauri.app) (Rust) — file storage, SQLite database, PDF serving
- React + TypeScript + Vite — UI (in `ui/`)
- Tailwind CSS v4, pdf.js

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
PROGRESS.md  Implementation progress and development notes
```
