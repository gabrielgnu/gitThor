#!/usr/bin/env bash
# Project-isolated Linux build. No sudo, global packages, or existing node_modules.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.cache/gitthor"
BUILD="$(mktemp -d "$HOME/.cache/gitthor/build.XXXXXX")"
printf 'Linux build workspace: %s\n' "$BUILD"
mkdir -p "$BUILD/runtime" "$BUILD/project"
curl --fail --location --silent --show-error https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$BUILD/SHASUMS256.txt"
ARCHIVE="$(awk '$2 ~ /linux-x64.tar.xz$/ {print $2; exit}' "$BUILD/SHASUMS256.txt")"
test -n "$ARCHIVE"
curl --fail --location --show-error "https://nodejs.org/dist/latest-v24.x/$ARCHIVE" -o "$BUILD/$ARCHIVE"
(cd "$BUILD" && awk '$2 ~ /linux-x64.tar.xz$/ {print}' SHASUMS256.txt | sha256sum --check)
tar -xJf "$BUILD/$ARCHIVE" --strip-components=1 -C "$BUILD/runtime"
export PATH="$BUILD/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
(cd "$ROOT" && tar -cf - package.json package-lock.json LICENSE README.md PRIVACY.md SECURITY.md docs electron src assets tests scripts) | tar -xf - -C "$BUILD/project"
cd "$BUILD/project"
node --version
git --version
npm ci --no-fund --no-audit
npm run check
npm test
npm run dist:linux -- --publish never
mkdir -p "$ROOT/dist"
cp dist/*.deb dist/*.AppImage "$ROOT/dist/"
printf '\nLinux packages copied to %s/dist\n' "$ROOT"
printf 'Build workspace retained for desktop validation: %s\n' "$BUILD"
ldd dist/linux-unpacked/gitthor | grep 'not found' || true
if GITTHOR_EXECUTABLE="$BUILD/project/dist/linux-unpacked/gitthor" npm run test:ui; then
  mkdir -p "$ROOT/test-results/linux"
  cp test-results/*.png "$ROOT/test-results/linux/"
else
  printf 'Desktop smoke test pending: check missing desktop libraries or DISPLAY above.\n'
fi
