#!/usr/bin/env bash
# Installs Oikotheke on Linux: binary, desktop entry and icons.
#
# Usage: scripts/install.sh [--system] [--prefix DIR] [--skip-build]
#   (default)     install for the current user into ~/.local (no sudo needed)
#   --system      install for all users into /usr/local (uses sudo for copying only)
#   --prefix DIR  install into a custom prefix
#   --skip-build  reuse an existing release binary instead of building
set -euo pipefail

APP_ID="oikotheke"
APP_NAME="Oikotheke"
# Launcher files of the app before it was renamed from PDF Shelf.
LEGACY_APP_ID="pdf-shelf"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="$ROOT/src-tauri/target/release/$APP_ID"
ICONS="$ROOT/src-tauri/icons"

PREFIX="$HOME/.local"
BUILD=1

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --system) PREFIX="/usr/local" ;;
    --prefix) [[ $# -ge 2 ]] || die "--prefix needs a directory"; PREFIX="$2"; shift ;;
    --skip-build) BUILD=0 ;;
    -h | --help) usage; exit 0 ;;
    *) usage; die "unknown option: $1" ;;
  esac
  shift
done

[[ "$(uname -s)" == "Linux" ]] || die "this installer only supports Linux"
[[ $EUID -ne 0 ]] || die "run this script as your normal user; it asks for sudo only when needed"

# Runtime dependency of every Tauri app on Linux. (No `grep -q`: with pipefail its early exit
# makes ldconfig fail with SIGPIPE and the check would report a false negative.)
if ! ldconfig -p 2>/dev/null | grep "libwebkit2gtk-4.1.so" >/dev/null; then
  warn "WebKitGTK 4.1 was not found. Install it first, for example:"
  warn "  Debian/Ubuntu: sudo apt install libwebkit2gtk-4.1-0"
  warn "  Fedora:        sudo dnf install webkit2gtk4.1"
  warn "  Arch:          sudo pacman -S webkit2gtk-4.1"
fi

# --- Build -------------------------------------------------------------------

if [[ $BUILD -eq 1 ]]; then
  command -v npm >/dev/null || die "npm is required to build (or pass --skip-build)"
  command -v cargo >/dev/null || die "cargo (Rust) is required to build (or pass --skip-build)"
  cd "$ROOT"
  if [[ ! -d node_modules ]]; then
    info "Installing JavaScript dependencies"
    npm ci
  fi
  info "Building $APP_NAME (release, this can take a few minutes)"
  npm run tauri build -- --no-bundle
fi
[[ -x "$BINARY" ]] || die "release binary not found at $BINARY (run without --skip-build)"

# --- Install -----------------------------------------------------------------

SUDO=""
mkdir -p "$PREFIX" 2>/dev/null || true
if [[ ! -w "$PREFIX" ]]; then
  command -v sudo >/dev/null || die "$PREFIX is not writable and sudo is not available"
  SUDO="sudo"
  info "Using sudo to write into $PREFIX"
fi

BIN_DIR="$PREFIX/bin"
APPS_DIR="$PREFIX/share/applications"
ICON_DIR="$PREFIX/share/icons/hicolor"

info "Installing binary to $BIN_DIR/$APP_ID"
$SUDO install -Dm755 "$BINARY" "$BIN_DIR/$APP_ID"

info "Installing icons"
declare -A SIZES=(
  [32]="32x32.png"
  [64]="64x64.png"
  [128]="128x128.png"
  [256]="128x128@2x.png"
  [512]="icon.png"
)
for size in "${!SIZES[@]}"; do
  $SUDO install -Dm644 "$ICONS/${SIZES[$size]}" "$ICON_DIR/${size}x${size}/apps/$APP_ID.png"
done
$SUDO install -Dm644 "$ROOT/assets/app-icon.svg" "$ICON_DIR/scalable/apps/$APP_ID.svg"

info "Installing desktop entry"
DESKTOP_FILE="$(mktemp)"
trap 'rm -f "$DESKTOP_FILE"' EXIT
cat >"$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
GenericName=Book Library
Comment=Organize, read and annotate your books locally
Exec=$BIN_DIR/$APP_ID
Icon=$APP_ID
Terminal=false
Categories=Office;Viewer;
Keywords=pdf;books;reader;library;notes;
StartupWMClass=$APP_ID
StartupNotify=true
EOF
$SUDO install -Dm644 "$DESKTOP_FILE" "$APPS_DIR/$APP_ID.desktop"

# Replace the PDF Shelf launcher, if present: the renamed app takes over its library.
LEGACY_FILES=("$BIN_DIR/$LEGACY_APP_ID" "$APPS_DIR/$LEGACY_APP_ID.desktop" "$ICON_DIR/scalable/apps/$LEGACY_APP_ID.svg")
for size in "${!SIZES[@]}"; do
  LEGACY_FILES+=("$ICON_DIR/${size}x${size}/apps/$LEGACY_APP_ID.png")
done
for file in "${LEGACY_FILES[@]}"; do
  if [[ -e "$file" ]]; then
    info "Removing old PDF Shelf file $file"
    $SUDO rm -f "$file"
  fi
done

# Refresh caches so the launcher and icon show up right away (best effort).
if command -v update-desktop-database >/dev/null; then
  $SUDO update-desktop-database -q "$APPS_DIR" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null; then
  $SUDO gtk-update-icon-cache -q -t -f "$ICON_DIR" 2>/dev/null || true
fi

info "$APP_NAME installed."
echo "    An existing PDF Shelf library is moved over automatically on first launch."
echo "    Launch it from your applications menu, or run: $BIN_DIR/$APP_ID"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "    Note: $BIN_DIR is not in your PATH (the menu entry works regardless)." ;;
esac
