# Protocol Tracker

A **local-first** clinical protocol tracker. Add and track protocol records on your device; your data is stored **only** in the browser (IndexedDB) and **never** sent to a server. Back up and move data between devices with an **encrypted** file you control.

Installable as a PWA — on iOS/Android, *Add to Home Screen* launches it full-screen like a native app, and it works offline.

## Why local-first
- **Privacy by design:** no server holds patient data, so the compliance surface shrinks dramatically.
- **Portable:** encrypted backup/restore (`.ptbackup`) moves data device-to-device with a passphrase.
- **Offline:** a service worker caches the app shell; it opens with no network.

## Encryption
Backups are encrypted entirely in the browser:
`passphrase → PBKDF2-SHA256 (200k iterations) → AES-GCM-256`.
The backup file contains only ciphertext, a random salt, and an IV — no readable data, and no key. Lose the passphrase and the backup is unrecoverable by design.

## Run locally
No build step. Serve the folder over `http://localhost` (a secure context, required for service workers + WebCrypto):

```bash
python3 -m http.server 8787
# open http://127.0.0.1:8787/index.html
```

## Structure
| File | Role |
|------|------|
| `index.html` | UI shell |
| `app.js` | records (IndexedDB) + encrypted backup/restore (WebCrypto) |
| `styles.css` | styling |
| `manifest.webmanifest` | PWA manifest (installable, standalone) |
| `sw.js` | service worker (offline app-shell cache) |
| `build_icons.js` | regenerates the PNG icons (`node build_icons.js`) |

## Versions
- **v2.x** — this local-first PWA (current).
- **v1.x** — the original React Native / Expo health-tracker app, preserved at tag [`v1.1.0`](../../releases/tag/v1.1.0). Check it out with `git checkout v1.1.0`.

## License
See [LICENSE](./LICENSE).
