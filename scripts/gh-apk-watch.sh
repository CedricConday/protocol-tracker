#!/usr/bin/env bash
# Watch the android-apk GitHub Actions run and fetch the APK when it lands.
# Run it in your own screen/tmux window:
#
#   screen -S apk
#   ./scripts/gh-apk-watch.sh
#   (ctrl-a d detaches, `screen -r apk` comes back)
#
# Success: downloads the artifact and prints the APK path and size.
# Failure: prints the log of the step that actually failed.
#
# Exit: 0 success, 1 failed/cancelled, 2 bad usage or no run found.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="android-apk.yml"
OUTDIR="$HOME/apk"
INTERVAL=30
RUN_ID=""
ONCE=0

usage() {
  cat <<'USAGE'
usage: scripts/gh-apk-watch.sh [RUN_ID] [--interval SECONDS] [--out DIR] [--once]

  RUN_ID       defaults to the newest android-apk run
  --interval   seconds between polls (default 30; the build is ~15-25 min)
  --out        where to put the APK (default ~/apk)
  --once       print status once and exit, no loop
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) INTERVAL="${2:?--interval needs seconds}"; shift ;;
    --out)      OUTDIR="${2:?--out needs a directory}"; shift ;;
    --once)     ONCE=1 ;;
    -h|--help)  usage; exit 0 ;;
    -*)         echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
    *)          RUN_ID="$1" ;;
  esac
  shift
done

command -v gh >/dev/null || { echo "gh CLI not found" >&2; exit 2; }
cd "$ROOT"

if [[ -z "$RUN_ID" ]]; then
  RUN_ID="$(gh run list --workflow="$WORKFLOW" --limit 1 --json databaseId -q '.[0].databaseId')"
  [[ -n "$RUN_ID" ]] || { echo "no $WORKFLOW runs found — pass a run id" >&2; exit 2; }
fi

echo "watching run $RUN_ID  (every ${INTERVAL}s)"
gh run view "$RUN_ID" --json url -q .url

while :; do
  read -r STATUS CONCLUSION <<<"$(gh run view "$RUN_ID" --json status,conclusion -q '.status+" "+(.conclusion//"-")')"
  # Name the step in flight, so a stall is visible rather than just "in_progress".
  STEP="$(gh run view "$RUN_ID" --json jobs \
    -q '[.jobs[].steps[] | select(.status=="in_progress") | .name] | first // "-"' 2>/dev/null || echo '-')"
  echo "$(date +%H:%M:%S)  $STATUS  ${CONCLUSION}  step: $STEP"

  if [[ "$STATUS" == "completed" ]]; then
    if [[ "$CONCLUSION" == "success" ]]; then
      printf '\a'
      mkdir -p "$OUTDIR"
      gh run download "$RUN_ID" -D "$OUTDIR/$RUN_ID"
      APK="$(find "$OUTDIR/$RUN_ID" -name '*.apk' | head -1)"
      if [[ -n "$APK" ]]; then
        echo "APK: $APK"
        du -h "$APK" | cut -f1 | sed 's/^/size: /'
        echo "sideload it:  adb install -r '$APK'"
      else
        echo "run succeeded but no .apk in the artifact — check $OUTDIR/$RUN_ID"
      fi
      exit 0
    fi
    printf '\a'
    if [[ "$CONCLUSION" == "cancelled" ]]; then
      # --log-failed prints nothing for a cancellation (a job killed by
      # timeout-minutes lands here), so show the tail of the last live step.
      echo "run cancelled — last step to run was:"
      gh run view "$RUN_ID" --json jobs \
        -q '[.jobs[].steps[] | select(.conclusion=="cancelled") | .name] | first // "-"'
      echo "tail of its log:"
      gh run view "$RUN_ID" --log 2>/dev/null | tail -30
    else
      echo "run $CONCLUSION — log of the failing step:"
      gh run view "$RUN_ID" --log-failed 2>/dev/null | tail -40
    fi
    exit 1
  fi

  (( ONCE )) && exit 0
  sleep "$INTERVAL"
done
