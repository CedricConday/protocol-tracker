# Protocol Tracker — v1 Data Contract (FROZEN)

> **Status:** frozen baseline as of app **v15**, `SCHEMA_VERSION = 1`.
> This documents the on-device data shape so future changes stay **additive** and
> `runMigrations()` (app.js) has a known starting point. **Do not change a v1 field's
> meaning or type** — add new fields / a new `type`, bump `SCHEMA_VERSION`, and write an
> ordered migration instead. Every claim here was read from `app.js` (not recalled).

## Storage engine

- **IndexedDB database:** `protocol-tracker`, **version `2`** (`app.js:6,11`).
- **Object stores** (created in `onupgradeneeded`, `app.js:14-15`):
  - **`records`** — keyPath **`id`**. All user data (PHI) lives here, encrypted at rest.
  - **`meta`** — keyPath **`k`**. Small unencrypted control rows (auth params, schema version).

## Crypto (zero-knowledge, on-device only)

- **KDF:** PBKDF2-SHA-256, **`KDF_ITERS = 200000`** iterations (`app.js:40,45`).
- **Cipher:** AES-GCM-256, random **12-byte IV** per encryption (`app.js:46,50`).
- The passphrase is **never stored**. `meta.auth` holds only: `salt` (b64, 16 bytes),
  `iters` (the KDF iteration count used — read back on unlock so params can evolve
  without bricking existing data), and a `verifier` = the constant token
  **`protocol-tracker-verify-v1`** encrypted under the derived key (`app.js:64-74`).
- Unlock re-derives the key and decrypts the verifier; match ⇒ correct passphrase
  (`app.js:78-87`). `unlock()` honors the **stored `iters`** (`meta.iters || KDF_ITERS`),
  not the current constant.
- Session key lives **in memory only** (`sessionKey`); lost on close or Lock. **No recovery.**
  The encrypted backup/restore (below) is the only safety net.

## Record row shape (on disk, in `records`)

Every row is stored encrypted and looks like (`app.js:95-98`):

```
{ id: <string, plaintext>, enc: 1, iv: <b64>, ct: <b64> }
```

- **`id`** stays plaintext (it is a random uuid or a derived key like `log-YYYY-MM-DD`,
  **never PHI**) so rows can be `put`/`delete`d by key.
- **All other fields** live inside the AES-GCM ciphertext `ct`. Decrypted, a record has a
  **`type`** discriminator and the per-type fields below.

## Record types (decrypted payloads)

| `type`    | `id`                | Fields (verified from writers) |
|-----------|---------------------|--------------------------------|
| `profile` | `'profile'` (singleton) | `name`, `weight`, `weightUnit` (`'kg'` default), `condition` (`app.js:246-249`) |
| `supp`    | `uid()`             | `suppId`/catalog ref, `name`, `form`, `dose`, `unit`, `dayParts[]`, `timingKey` (default `'with-food'`) (`app.js:364-371`) |
| `log`     | `'log-YYYY-MM-DD'`  | `date`, `t0` (Start-my-day epoch ms, `null` until started), `planned` (dose count at T0 = adherence denominator), `taken` map (`app.js:189,422-424`) |
| `symptom` | `uid()`             | `date`, `ts` (ISO), `label`, `severity` (1–10 Number), `note` (`app.js:437`) |
| `water`   | `uid()`             | `date`, `ts` (ISO), `ml` (`app.js:459`) |
| `meal`    | `uid()`             | `date`, `ts` (ISO), `kind`, `note` (`app.js:478`) |

- **`log.taken`** is a map keyed **`"<suppId>::<daypart>"`** ⇒ `true` (`app.js:568,956`).
  A dose is "taken" iff its `suppId::daypart` key is present.
- **`log.planned`** is set once, at Start-my-day, to the number of scheduled dose-items
  that day (`app.js:424`); it is the fixed denominator for adherence history.

## `meta` store rows

| `k`        | Payload |
|------------|---------|
| `'auth'`   | `{ k:'auth', v:1, salt, iters, verifier:{iv,ct} }` (`app.js:74`) |
| `'schema'` | `{ k:'schema', v: SCHEMA_VERSION }` — current on-disk schema version (`app.js:203,209-210`) |

## Portable encrypted backup (cross-device)

`encryptBackup()` / `decryptBackup()` (`app.js:124-137`) produce a **self-describing** blob
with its **own** passphrase (independent of the unlock passphrase):

```
{
  app: 'protocol-tracker',
  v: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iters: 200000 },
  salt: <b64, 16 bytes>,
  iv: <b64>,
  ciphertext: <b64>,      // AES-GCM of the full records array
  createdAt: <ISO string>
}
```

- Restore validates `blob.app === 'protocol-tracker'` before touching anything, and
  derives with the blob's **own** `kdf.iters` (falls back to `KDF_ITERS`) — so a backup
  taken under one iteration count still restores after the constant changes.

## Migration rule (how to evolve this contract)

1. Never repurpose a v1 field. Add new fields / a new `type` only.
2. Bump `SCHEMA_VERSION` in `app.js`.
3. Add an ordered `cur -> SCHEMA_VERSION` step inside `runMigrations()` — it runs after
   every unlock, **behind decryption**, and must be **non-destructive** (`app.js:200-211`).
4. Add a harness check for the migration in `test/harness.mjs`.
