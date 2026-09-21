#!/usr/bin/env bash
# Watch an EAS build to completion. Run it in your own screen/tmux window.
#
#   screen -S eas
#   ./scripts/eas-watch.sh
#   (ctrl-a d detaches, `screen -r eas` comes back)
#
# One status line per poll; rings the bell and exits when the build settles.
# FINISHED prints the APK URL. ERRORED downloads the build log and prints the
# failing phase — that log is brotli, not gzip, so gunzip on it will not work;
# this script handles that.
#
# Exit: 0 finished, 1 errored/cancelled, 2 bad usage or no session.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="https://api.expo.dev/graphql"
STATE="$HOME/.expo/state.json"
INTERVAL=300
BUILD_ID=""
ONCE=0

usage() {
  cat <<'USAGE'
usage: scripts/eas-watch.sh [BUILD_ID] [--interval SECONDS] [--once]

  BUILD_ID     defaults to the newest Android build on this project
  --interval   seconds between polls (default 300; no point hammering EAS)
  --once       print status once and exit, no loop
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) INTERVAL="${2:?--interval needs seconds}"; shift ;;
    --once)     ONCE=1 ;;
    -h|--help)  usage; exit 0 ;;
    -*)         echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
    *)          BUILD_ID="$1" ;;
  esac
  shift
done

[[ -r "$STATE" ]] || { echo "no Expo session at $STATE — run: npx eas-cli login" >&2; exit 2; }
SECRET="$(python3 -c "import json;print(json.load(open('$STATE'))['auth']['sessionSecret'])")"

# One GraphQL round trip: body in $1, JSON on stdout.
gql() {
  curl -s --max-time 30 "$API" \
    -H 'Content-Type: application/json' \
    -H "expo-session: $SECRET" \
    -d "$1"
}

if [[ -z "$BUILD_ID" ]]; then
  echo "resolving newest Android build (npx, slow the first time)…"
  BUILD_ID="$(cd "$ROOT" && npx eas-cli build:list --platform android --limit 1 --non-interactive --json 2>/dev/null \
    | python3 -c "import json,sys; s=sys.stdin.read(); s=s[s.index('['):]; print(json.loads(s)[0]['id'])")"
  [[ -n "$BUILD_ID" ]] || { echo "could not resolve a build id — pass one explicitly" >&2; exit 2; }
fi

LOGDIR="$HOME/.cache/eas-watch"
mkdir -p "$LOGDIR"

echo "watching build $BUILD_ID  (every ${INTERVAL}s)"
echo "https://expo.dev/accounts/<expo-account>/projects/protocol-tracker/builds/$BUILD_ID"

Q_STATUS='{"query":"query($id:ID!){builds{byId(buildId:$id){status queuePosition estimatedWaitTimeLeftSeconds artifacts{buildUrl applicationArchiveUrl}}}}","variables":{"id":"'"$BUILD_ID"'"}}'

# Pull the log and show the phase that failed. Files are kept, not deleted.
dump_failure() {
  local url br="$LOGDIR/$BUILD_ID.br"
  url="$(gql '{"query":"query($id:ID!){builds{byId(buildId:$id){logFiles}}}","variables":{"id":"'"$BUILD_ID"'"}}' \
    | python3 -c "import json,sys; f=(json.load(sys.stdin)['data']['builds']['byId'] or {}).get('logFiles') or ['']; print(f[0])")"
  [[ -n "$url" ]] || { echo "no log file published for this build"; return; }
  curl -s --max-time 60 "$url" -o "$br" || { echo "log download failed"; return; }
  node -e "
    const z=require('zlib'),fs=require('fs');
    const raw=fs.readFileSync(process.argv[1]);
    let out; try{ out=z.brotliDecompressSync(raw) }catch(e){ out=raw }  // served plain on occasion
    const rows=out.toString().split('\n').filter(Boolean)
      .map(l=>{ try{ return JSON.parse(l) }catch(e){ return null } }).filter(Boolean);
    const errored=rows.filter(r=>r.level>=50).map(r=>r.phase).filter(Boolean);
    const phase=errored[0] || (rows.length ? rows[rows.length-1].phase : null);
    console.log('--- failing phase: '+phase+' ---');
    for(const r of rows) if(r.phase===phase && r.msg) console.log(r.msg);
  " "$br"
  echo "(raw log kept at $br)"
}

while :; do
  if ! RESP="$(gql "$Q_STATUS")"; then
    echo "$(date +%H:%M:%S)  API unreachable, retrying"
    sleep "$INTERVAL"; continue
  fi
  read -r STATUS POS WAIT APK <<<"$(printf '%s' "$RESP" | python3 -c "
import json,sys
b=((json.load(sys.stdin).get('data') or {}).get('builds') or {}).get('byId') or {}
a=b.get('artifacts') or {}
print(b.get('status','?'), b.get('queuePosition') or '-', b.get('estimatedWaitTimeLeftSeconds') or '-',
      a.get('applicationArchiveUrl') or a.get('buildUrl') or '-')
")"
  echo "$(date +%H:%M:%S)  $STATUS  queue=$POS  eta=${WAIT}s"

  case "$STATUS" in
    FINISHED)
      printf '\a'
      echo "APK: $APK"
      echo "grab it with:  curl -L -o ~/protocol-tracker-preview.apk '$APK'"
      exit 0 ;;
    ERRORED|CANCELED)
      printf '\a'
      echo "build $STATUS — pulling the log"
      dump_failure
      exit 1 ;;
  esac

  (( ONCE )) && exit 0
  sleep "$INTERVAL"
done
