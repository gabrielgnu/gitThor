#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(realpath "$1")"
case "$BUILD" in "$HOME"/.cache/gitthor/build.*) ;; *) exit 1 ;; esac
test -d "$BUILD/project/node_modules"
(cd "$ROOT" && tar -cf - package.json package-lock.json LICENSE README.md PRIVACY.md SECURITY.md docs electron src assets tests scripts) | tar -xf - -C "$BUILD/project"
export PATH="$BUILD/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
cd "$BUILD/project"
if test -d "$BUILD/desktop-libs/root/usr/lib/x86_64-linux-gnu"; then
  export LD_LIBRARY_PATH="$BUILD/desktop-libs/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
npm run check
npm test
npm run dist:linux
cp dist/*.deb dist/*.AppImage "$ROOT/dist/"
VERSION="$(node -p "require('./package.json').version")"
dpkg-deb --info "dist/GitThor-$VERSION-linux-amd64.deb"
ldd dist/linux-unpacked/gitthor | grep 'not found' || true
printf 'DISPLAY=%s\n' "${DISPLAY:-unset}"
GITTHOR_EXECUTABLE="$BUILD/project/dist/linux-unpacked/gitthor" npm run test:ui
GITTHOR_EXECUTABLE="$BUILD/project/dist/linux-unpacked/gitthor" npm run test:security:ui
mkdir -p "$ROOT/test-results/linux"
cp test-results/*.png "$ROOT/test-results/linux/"
cp test-results/security-ui-linux.json "$ROOT/test-results/linux/"
