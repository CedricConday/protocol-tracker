#!/usr/bin/env bash
# Launch the Protocol Tracker dev server for Expo Go.
#
# Why this and not a local APK: this box is aarch64 and the Android NDK/CMake
# toolchain shipped with the SDK is x86-64, so every native configure step dies
# with "x86_64-binfmt-P: Could not open '/lib64/ld-linux-x86-64.so.2'".
# Logs of that failed run: ~/holding/apk-build-failed-20260915/
# The app itself is Expo-Go-safe (see BUILD_NOTES_2026-07-07.md) — no native
# build is needed to run it on a phone.
#
# On the phone: install ~/SCA Holdings/gimel/offload/expo-go/Expo-Go-57.0.9.apk, open Expo Go,
# scan the QR this prints. Keep this running; Ctrl-C stops it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8081}"
MODE="tunnel"
CLEAR=""
RUN_TSC=0

usage() {
  cat <<'USAGE'
usage: scripts/expo-go.sh [--tunnel|--lan] [--port N] [--clear] [--check]

  --tunnel   public ngrok URL — the default, and the only mode that reaches a
             phone that is not on this box's network (it is a remote VPS)
  --lan      LAN URL only; use when you are tunnelling/VPNing in yourself
  --port N   Metro port (default 8081; the pt-* lanes squat 8090-8095)
  --clear    wipe the Metro cache before starting
  --check    run tsc --noEmit first and refuse to start if it is red
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tunnel) MODE="tunnel" ;;
    --lan)    MODE="lan" ;;
    --port)   PORT="${2:?--port needs a number}"; shift ;;
    --clear)  CLEAR="--clear" ;;
    --check)  RUN_TSC=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

cd "$ROOT"
echo "== lane:  $ROOT ($(git branch --show-current 2>/dev/null || echo 'no git'))"
echo "== mode:  $MODE on port $PORT"

# --- preflight -------------------------------------------------------------
fail() { echo "FAIL: $*" >&2; exit 1; }

[[ -d node_modules ]] || fail "node_modules missing — run: npm ci"
[[ -x node_modules/.bin/expo ]] || fail "expo CLI missing from node_modules — run: npm ci"

# Another Metro already up? Two servers on one project confuse Expo Go badly.
while read -r pid _; do
  [[ -n "${pid:-}" ]] || continue
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || echo '?')"
  echo "WARN: expo/metro already running (pid $pid) in $cwd"
done < <(pgrep -af "expo start|expo/metro" 2>/dev/null || true)

if command -v ss >/dev/null && ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q .; then
  fail "port $PORT is already in use — pick another with --port"
fi

if [[ "$MODE" == "tunnel" && -L "$HOME/.expo/ngrok.yml" && ! -e "$HOME/.expo/ngrok.yml" ]]; then
  # Dangling since the ngrok secrets went away; ngrok may choke reading it.
  echo "WARN: ~/.expo/ngrok.yml is a dead symlink (target ~/.secrets/ngrok/ngrok.yml is gone)."
  echo "      If the tunnel fails to open:  rm ~/.expo/ngrok.yml   (then rerun)"
fi

if (( RUN_TSC )); then
  echo "== tsc --noEmit"
  npx tsc --noEmit || fail "typecheck is red — fix it or drop --check"
fi

# --- run -------------------------------------------------------------------
# Foreground on purpose: the QR code and the r/m hotkeys need this terminal.
echo "== starting — scan the QR with Expo Go, Ctrl-C to stop"
exec npx expo start "--$MODE" --port "$PORT" $CLEAR
