#!/usr/bin/env bash
# Restore tracked native assets (custom sound) into the gitignored, regenerated platform dirs.
# Run after `npx cap add <platform>` / `npx cap sync` on any machine.
set -euo pipefail
cd "$(dirname "$0")"
if [ -d android ]; then
  mkdir -p android/app/src/main/res/raw
  cp sounds/dose.wav android/app/src/main/res/raw/dose.wav
  echo "android: dose.wav → res/raw ✓"
fi
if [ -d ios ]; then
  cp sounds/dose.wav "ios/App/App/dose.wav" 2>/dev/null \
    && echo "ios: dose.wav → App/App (then add to target: Xcode ▸ Build Phases ▸ Copy Bundle Resources) ✓" \
    || echo "ios: copy sounds/dose.wav into the App target manually in Xcode"
fi
