#!/usr/bin/env bash
# Stage the static PWA into www/ for Capacitor. Regenerate anytime; www/ is gitignored.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf www && mkdir -p www
cp index.html app.js sw.js styles.css manifest.webmanifest cap-notify.js www/
cp -r icons content www/
echo "www/ staged: $(ls www | tr '\n' ' ')"
