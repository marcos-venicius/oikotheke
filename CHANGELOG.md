# Changelog

All notable changes to Oikotheke are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-10-03

### Added

- Discover: 30 hand-picked, freely licensed books (Portuguese and English classics, and
  programming books) that download from their official sources and import in one click. The
  list is part of the app, so browsing it needs no internet connection.
- Books imported from Discover show their source and license on the book page.

## [1.1.1] - 2026-09-30

### Changed

- Ctrl + mouse wheel and Ctrl +/− zoom PDFs and change the font size of EPUBs.

## [1.1.0] - 2026-09-29

### Added

- Windows installer (64-bit), attached to every release and linked from the website.

## [1.0.0] - 2026-09-29

The first release: a local-first library and reader for PDF and EPUB books.

### Added

- Library shelf with covers, titles, authors, reading progress and note indicators, ordered by
  most recent activity.
- Import of PDF and EPUB books with the file picker or drag and drop; every book is copied into
  the app's own storage, and the same book is never imported twice.
- Remove from library (restorable) and delete permanently.
- PDF reader with page navigation, jump to page, zoom and fit modes (page, width, height).
- EPUB reader with book-like pages or continuous scroll, table of contents, font size and
  light or dark themes.
- Focus mode, and automatic saving and restoring of the reading position.
- Notes tied to pages: create, edit, delete, indicators, and jumping between annotated places.
- Book details page with progress and every note in reading order.
- Web links in books open in the browser only after confirmation; EPUB content can't run
  scripts or reach the network.
- Linux install and uninstall scripts.
- Automatic migration of libraries from PDF Shelf, the app's former name.
- Project website.

### Fixed

- The app icon now shows in window switchers (alt-tab) on Linux.

[Unreleased]: https://github.com/marcos-venicius/oikotheke/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/marcos-venicius/oikotheke/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/marcos-venicius/oikotheke/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/marcos-venicius/oikotheke/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/marcos-venicius/oikotheke/releases/tag/v1.0.0
