#!/usr/bin/env bash
set -u
uname -a
cat /etc/os-release
for tool in node npm git xvfb-run curl tar; do command -v "$tool" || true; done
node --version 2>/dev/null || true
npm --version 2>/dev/null || true
git --version
id
