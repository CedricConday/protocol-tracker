# Device-to-device transfer (task #11) — design options, needs a decision

> **Status:** proposal only, nothing built. Written 2026-07-04 while the buildable
> tasks (#7, #10) shipped. This one needs Cedric to pick a direction before code,
> because the app is **zero-knowledge with no backend for user data** — there is no
> server to relay a vault through, which is the whole difficulty.

## The constraint that shapes everything

- All user data is AES-GCM encrypted on-device; the server (`push.condaydigital.com`)
  only ever sees generic push schedules — never records. There is **no store-and-forward
  backend** for the vault.
- A QR code holds ~2–3 KB of data. A real vault (logs, symptoms, months of history) is
  far larger. **So a QR code cannot carry the vault itself** — only a short secret or a URL.

## What we already have (the honest baseline)

The **encrypted backup/restore** (Manage → Export/Restore) *is already a device-to-device
transfer*: export the `.ptbackup` file, move it by AirDrop / email / cloud / cable, restore
on the new device with the backup passphrase. It works today and is covered by tests
(`round-trip is loss-less`). Any #11 work should be measured against "is this meaningfully
better than the backup file we already ship?"

## Options

### A. QR-of-passphrase, blob moves out-of-band  *(smallest, safe)*
Old device shows a QR encoding a **one-time transfer PIN**; it exports the vault encrypted
under that PIN to a file. New device scans the QR (gets the PIN), user moves the file over,
import auto-uses the scanned PIN. **Pro:** tiny delta on existing backup, no new backend,
no new trust model. **Con:** user still moves a file manually — QR only saves typing a
passphrase. Marginal.

### B. LAN / WebRTC direct transfer  *(best UX, most work)*
QR carries a WebRTC offer (SDP + a short-lived symmetric key). New device scans → a direct
peer connection opens → vault streams encrypted device-to-device, no file, no server.
**Pro:** the "magic" one-scan transfer. **Con:** WebRTC needs a **signaling** step (usually
a tiny relay) and often a STUN/TURN server for NAT traversal — i.e. new infra, and a TURN
relay sees (encrypted) traffic. Meaningful build + ops. Cross-network (not same Wi-Fi) is
where it gets hard.

### C. Relay-blob via our own service  *(rejected — breaks the promise)*
Old device uploads the encrypted vault to a short-lived slot on our server; QR carries the
slot id + decryption key; new device downloads + decrypts. **Rejected:** even though the
blob is encrypted, routing the vault through our server erodes the "your data never touches
a server" guarantee that is the app's core pitch. Don't.

## Recommendation

Ship **A** first (it's a genuine, safe, testable increment on the existing backup and needs
no new infra), and treat **B** as a separate, later project if the one-scan UX is worth the
signaling/TURN infrastructure. Do **not** do **C**.

## If we build A — the crypto shape (all headless-testable, mirrors the backup path)
1. New device generates an ephemeral transfer keypair… **or** simplest: old device generates
   a random 6–8 word / 32-byte PIN, shows it as a QR.
2. Old device: `encryptBackup(PIN, records)` → file (reuse existing function).
3. New device: scan QR → PIN; user imports file → `decryptBackup(PIN, blob)` (reuse existing).
4. Add a QR generator (small dep or hand-rolled) + a scanner (`BarcodeDetector` where
   supported, else a camera-frame fallback). Both are UI; the crypto is already tested.

**Open decision for Cedric:** A now (safe, small), or commit to B (one-scan, needs signaling
+ TURN infra)? C is off the table.
