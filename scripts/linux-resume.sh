#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(realpath "$1")"
case "$BUILD" in "$HOME"/.cache/gitthor/build.*) ;; *) exit 1 ;; esac
test -d "$BUILD/project/node_modules"
(cd "$ROOT" && tar -cf - package.json package-lock.json LICENSE README.md electron src assets tests scripts) | tar -xf - -C "$BUILD/project"
export PATH="$BUILD/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
cd "$BUILD/project"
npm run dist:linux
cp dist/*.deb dist/*.AppImage "$ROOT/dist/"
dpkg-deb --info dist/*.deb
ldd dist/linux-unpacked/gitthor | grep 'not found' || true
printf 'DISPLAY=%s\n' "${DISPLAY:-unset}"
GITTHOR_EXECUTABLE="$BUILD/project/dist/linux-unpacked/gitthor" npm run test:ui
mkdir -p "$ROOT/test-results/linux"
cp test-results/*.png "$ROOT/test-results/linux/"
