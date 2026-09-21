# Security Policy

## Threat model

Protocol Tracker is an offline-first Android app for tracking a high-dose Vitamin D3
protocol. It handles patient health information, and it handles it on one device, for one
person, with no account and no server of ours.

> **Corrected 2026-09-21.** Until this revision, the section below described optional cloud
> sync with JWT bearer tokens, and MRI report images being sent to Anthropic / OpenAI / Groq
> for OCR. **Neither feature exists in the shipping app**, and this file was the threat model
> the release notes pointed at — so it claimed a materially larger data surface than the code
> has. What was removed, and where to verify it:
>
> - **Cloud sync** — `src/api/syncClient.ts` has no default endpoint (`API_BASE` is
>   `process.env.EXPO_PUBLIC_API_URL ?? null`, so `SYNC_ENABLED` is false in every shipped
>   build), nothing in `src/` calls it, and `src/api/__tests__/no-first-party-server.test.ts`
>   fails if that changes. Family Sync and Caregiver mode were removed on 2026-09-20.
> - **AI vision / MRI OCR** — no vendor host appears anywhere in `src/`. The only remaining
>   trace is `AccountSettingsScreen.tsx` deleting a legacy `ai_api_key` from SecureStore when
>   the user erases their data, which is cleanup for installs that predate the removal.

### What the app does with sensitive data

- **Local storage** — dose logs, lab results, symptom journals, sleep and calcium logs, and
  the user profile live in a SQLite database inside the app sandbox. Nothing is uploaded.
- **No account, no first-party server** — there is nothing to register for and no endpoint to
  reach. The absence is enforced by a test, not by convention.
- **Biometric gate** — optional app-entry lock via `expo-local-authentication`. The check is
  performed by the OS; biometric data never reaches the app.
- **Notifications** — scheduled locally, no push service. Android channels are set to
  `PRIVATE` lock-screen visibility, so the detail appears only after unlock. Independently,
  `hideNotificationDetails` defaults to **on** and strips the patient name and supplement from
  the notification text itself, because the safe side is the right default for medical content.
- **Weather and UV (opt-in)** — when the weather card is enabled, coordinates go to
  `api.open-meteo.com` and `air-quality-api.open-meteo.com`. Coordinates only: no health data,
  no identifier. Off by default in the sense that it takes a permission grant; turning the card
  off means no permission prompt and no request.
- **Export and sharing** — reports are produced on device and leave it only when the user
  starts a share.

### Current security posture

- ✅ Parameterized SQL queries throughout
- ✅ No first-party server to attack, and a regression test that keeps it that way
- ✅ Biometric gate on app launch
- ✅ TLS for the one third-party host the app contacts
- ✅ No baked secrets in source
- ✅ No analytics, no crash reporting, no advertising SDK — none is installed
- ✅ Lock-screen content suppressed by default (see Notifications above)
- 🟡 SQLite is not encrypted at rest; it relies on the Android encrypted partition and the
  app sandbox. An attacker with a rooted device and physical access reads the database.
- 🟡 The APK is signed with a self-managed key rather than by Google Play, so users install
  past an "unknown sources" prompt — which is also the prompt an attacker would want a user
  trained to click through. Verify the SHA-256 on the release page.

### Privacy recommendation for users

The app suppresses reminder detail by default. If you turn that off in Settings and share the
device, also set **Android Settings → Notifications → Protocol Tracker** to hide sensitive
content on the lock screen — the app's `PRIVATE` channel covers the lock screen, but the
notification shade after unlock is yours to manage.

## Reporting a vulnerability

Please report security issues by opening a GitHub Security Advisory on this repository
(Security tab → Advisories → New draft security advisory), or by email to
**cedric@condaydigital.com**.

Acknowledgement within 72 hours, and a fix or mitigation guidance within 30 days for confirmed
vulnerabilities. Please do not open a public issue for an unfixed vulnerability.

## Scope

**In scope:**

- Code in this repository
- Dependency vulnerabilities surfaced via `npm audit`
- Storage and data-handling flaws, including anything that gets data off the device
- Anything that defeats the biometric gate or the lock-screen suppression

**Out of scope:**

- Open-Meteo's own security (the one third-party service the app contacts)
- User device security — rooted or compromised devices, and access to an unlocked device
- Social-engineering scenarios
- The dormant `syncClient.ts` endpoint contract, which is unreachable in a shipped build.
  A report showing it *is* reachable is very much in scope.

## Disclaimers

Protocol Tracker records what the user enters. It does not diagnose, does not recommend
treatment, and makes no medical assessment — it is **not a medical device** within the meaning
of EU 2017/745. It is not a substitute for medical advice; every decision about a protocol
belongs with the prescribing practitioner. The maintainer accepts no liability for medical
outcomes resulting from use of this software.
