# PDF Shelf — Progress

Living log of the v1 implementation. Keep it updated at the end of every work step.
Product spec: `CLAUDE.md` (Portuguese). Everything else (code, UI, commits, docs) is in English.

## Status

**Current phase:** 1 — Persistence core
**Next step:** AppError, SQLite connection + migrations, storage paths, repositories.

| # | Phase | Status |
|---|-------|--------|
| 0 | Scaffold (Tauri 2 + React/TS + Vite, Tailwind, lint, git) | ✅ done |
| 1 | Persistence core (Rust): errors, db + migrations, storage, repositories | ⏳ |
| 2 | Library backend: background import, remove/restore/delete, reconcile | ⏳ |
| 3 | UI shell + light/dark/system theme, router, settings | ⏳ |
| 4 | Library UI: grid, import queue cards, picker + drag-drop, covers, remove dialog | ⏳ |
| 5 | Reader: `pdfshelf://` range protocol, windowed rendering, nav, zoom, keyboard | ⏳ |
| 6 | Reading progress: debounced autosave, flush on close, reopen at last page | ⏳ |
| 7 | Notes: CRUD, panel, indicators, annotated-page navigation | ⏳ |
| 8 | Book details page + polish (states, toasts, a11y, perf) | ⏳ |
| 9 | Hardening (corrupt/permission/disk full/crash) + `tauri build` | ⏳ |

## Decisions

- **Stack:** Tauri 2 + React 19 + TypeScript + Vite, npm. Rust owns files + SQLite; UI talks only through `ui/services/*`.
- **Frontend folder is `ui/`** (not `src/`), per user request. `index.html` at the root loads `/ui/main.tsx`. Alias `@/` → `ui/`.
- **Styling:** Tailwind v4 + CSS variable tokens; themes light / dark / system. Minimal, modern look.
- **Import is non-blocking:** background copy queue in Rust, progress via Tauri events; metadata + cover generated in the background by pdf.js.
- **Large PDFs:** served via custom `pdfshelf://` scheme with HTTP Range; pdf.js with `disableAutoFetch`/`disableStream`; only current page + next 3 (+ prev 1) rendered, LRU eviction.
- **Integrity:** copy to `library/.staging-<id>` then rename; rows start as `importing`; startup reconcile cleans leftovers; permanent delete goes through `.trash-<id>`.
- **Remove:** "Remove from library" = soft delete (files kept, restorable). "Delete permanently" = files + notes gone. Never delete without explicit choice.
- DB paths are stored relative to the app data dir.

## Known issues / TODO

- `rsvg2` system dependency missing (reported by create-tauri-app). Probably only matters for bundling; check in phase 9.

## Notes for AI

- Commits: Conventional Commits, English, local only (never push). **Never add `Co-Authored-By` or any AI attribution.**
- Library versions are recent (pdfjs-dist 6, react-router 8, vitest 5, TypeScript 6, ESLint 10): check `node_modules/*/` typings before assuming APIs.
- TS 6: `baseUrl` is deprecated — use relative `paths` only.
- Commands: `npm run tauri dev`, `npm test`, `npm run lint`, `npm run typecheck`, `cd src-tauri && cargo test`.
- First `cargo check` takes ~2 min (webkit2gtk crates).
