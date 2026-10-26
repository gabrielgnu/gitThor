#!/usr/bin/env bash
# Fetch missing desktop libraries into this build only; never install system packages.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$(realpath "$1")"
case "$BUILD" in "$HOME"/.cache/gitthor/build.*) ;; *) exit 1 ;; esac
test -d "$BUILD/project/node_modules"
export PATH="$BUILD/runtime/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
mkdir -p "$BUILD/desktop-libs/root"
cd "$BUILD/desktop-libs"
apt-get download libnspr4 libnss3 libasound2t64
for package in ./*.deb; do dpkg-deb --extract "$package" root; done
export LD_LIBRARY_PATH="$BUILD/desktop-libs/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$BUILD/project"
ldd dist/linux-unpacked/gitthor | grep 'not found' || true
GITTHOR_EXECUTABLE="$BUILD/project/dist/linux-unpacked/gitthor" DEBUG=pw:browser npm run test:ui
mkdir -p "$ROOT/test-results/linux"
cp test-results/*.png "$ROOT/test-results/linux/"
