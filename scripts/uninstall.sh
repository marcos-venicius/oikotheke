#!/usr/bin/env bash
# Removes Oikotheke installed by scripts/install.sh.
#
# Usage: scripts/uninstall.sh [--system] [--prefix DIR] [--purge] [--yes]
#   (default)     remove the per-user install from ~/.local
#   --system      remove the install from /usr/local (uses sudo)
#   --prefix DIR  remove from a custom prefix
#   --purge       also delete your library: stored PDFs, notes and reading progress
#   --yes         don't ask for confirmation when purging
#
# Without --purge your library is kept, so reinstalling brings everything back.
set -euo pipefail

APP_ID="oikotheke"
APP_NAME="Oikotheke"
BUNDLE_ID="io.github.marcos-venicius.oikotheke"
# Names used before the rename from PDF Shelf; their files are removed too.
LEGACY_APP_ID="pdf-shelf"
LEGACY_BUNDLE_ID="com.pdfshelf.app"

PREFIX="$HOME/.local"
PURGE=0
ASSUME_YES=0

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --system) PREFIX="/usr/local" ;;
    --prefix) [[ $# -ge 2 ]] || die "--prefix needs a directory"; PREFIX="$2"; shift ;;
    --purge) PURGE=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    -h | --help) usage; exit 0 ;;
    *) usage; die "unknown option: $1" ;;
  esac
  shift
done

[[ $EUID -ne 0 ]] || die "run this script as your normal user; it asks for sudo only when needed"

ICON_DIR="$PREFIX/share/icons/hicolor"
FILES=()
for id in "$APP_ID" "$LEGACY_APP_ID"; do
  FILES+=("$PREFIX/bin/$id" "$PREFIX/share/applications/$id.desktop" "$ICON_DIR/scalable/apps/$id.svg")
  for size in 32 64 128 256 512; do
    FILES+=("$ICON_DIR/${size}x${size}/apps/$id.png")
  done
done

SUDO=""
if [[ -e "$PREFIX" && ! -w "$PREFIX" ]]; then
  command -v sudo >/dev/null || die "$PREFIX is not writable and sudo is not available"
  SUDO="sudo"
fi

if pgrep -x "$APP_ID" >/dev/null 2>&1 || pgrep -x "$LEGACY_APP_ID" >/dev/null 2>&1; then
  die "$APP_NAME is running. Close it and try again."
fi

removed=0
for file in "${FILES[@]}"; do
  if [[ -e "$file" ]]; then
    $SUDO rm -f "$file"
    removed=$((removed + 1))
  fi
done

if [[ $removed -eq 0 ]]; then
  info "No installed files found under $PREFIX"
else
  info "Removed $removed files from $PREFIX"
  if command -v update-desktop-database >/dev/null; then
    $SUDO update-desktop-database -q "$PREFIX/share/applications" 2>/dev/null || true
  fi
  if command -v gtk-update-icon-cache >/dev/null; then
    $SUDO gtk-update-icon-cache -q -t -f "$ICON_DIR" 2>/dev/null || true
  fi
fi

# User data always lives in the invoking user's XDG directories.
DATA_DIRS=()
for id in "$BUNDLE_ID" "$LEGACY_BUNDLE_ID"; do
  DATA_DIRS+=(
    "${XDG_DATA_HOME:-$HOME/.local/share}/$id"
    "${XDG_CACHE_HOME:-$HOME/.cache}/$id"
    "${XDG_CONFIG_HOME:-$HOME/.config}/$id"
  )
done
EXISTING=()
for dir in "${DATA_DIRS[@]}"; do
  [[ -e "$dir" ]] && EXISTING+=("$dir")
done

if [[ ${#EXISTING[@]} -eq 0 ]]; then
  exit 0
fi

if [[ $PURGE -eq 0 ]]; then
  info "Your library was kept (PDFs, notes and progress):"
  printf '    %s\n' "${EXISTING[@]}"
  echo "    Run with --purge to delete it."
  exit 0
fi

echo "This permanently deletes your $APP_NAME library, including all stored PDFs and notes:"
for dir in "${EXISTING[@]}"; do
  printf '    %s (%s)\n' "$dir" "$(du -sh "$dir" 2>/dev/null | cut -f1)"
done
if [[ $ASSUME_YES -eq 0 ]]; then
  read -r -p "Type 'delete' to confirm: " answer
  [[ "$answer" == "delete" ]] || die "aborted, nothing was deleted"
fi
rm -rf -- "${EXISTING[@]}"
info "Library deleted."
