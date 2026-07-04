# Protocol Tracker — Web Push scheduler

Tiny always-on service that fires **generic** dose reminders as Web Push, at times
the client registers on "Start my day" (T0 + each supplement's offset).

**Zero-PHI:** stores only `{ push subscription, [fire-timestamps] }` per device.
No supplement names, doses, or identity ever reach the server — the push body is
generic ("Time for your next dose") and the app fills in details on-device.

## Endpoints (behind Caddy at https://push.condaydigital.com)
- `GET /health` → `{ ok, schedules }`
- `GET /vapid` → `{ publicKey }`
- `POST /schedule` `{ subscription, fires: [{ at: epochMs }] }` → replaces this device's schedule
- `POST /cancel` `{ endpoint }` → removes it

## Run (VPS, systemd)
1. `npm install`
2. VAPID keys: `node -e "console.log(JSON.stringify(require('web-push').generateVAPIDKeys()))"` → put in `.env` (gitignored).
3. `.env`: `VAPID_PUBLIC=…`  `VAPID_PRIVATE=…`  `PORT=8091`
4. systemd unit runs `node server.js`; Caddy reverse-proxies `push.condaydigital.com` → `127.0.0.1:8091`.
5. DNS: `push.condaydigital.com` A-record → VPS IP (DNS-only) so Caddy can issue TLS.

The VAPID **public** key is also compiled into the client (`app.js`), which is fine — it's public by design. The **private** key stays only in `.env` on the VPS.
