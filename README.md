# Protocol Tracker

> Mobile companion for high-dose Vitamin D3 protocol patients.

Protocol Tracker is a React Native / Expo app for tracking supplement schedules, dose compliance, symptoms, and recovery progress on a high-dose Vitamin D3 therapy protocol. Built for autoimmune-disease patients (multiple sclerosis, lupus, psoriasis, vitiligo, rheumatoid arthritis, Hashimoto's, Crohn's, type 1 diabetes) who follow strict daily protocols requiring precise timing, dose stacking discipline, and long-horizon tracking.

> **Origin**: written for one real patient on a strict daily protocol, then generalized. It applies to anyone following a structured supplementation regimen with timing windows and lab-driven titration.

**Status:** feature-complete. Distributed as a direct-download Android APK; no App Store / Play Store listing yet. Installed builds take OTA updates over EAS Update.

---

## Download

**Android APK — [latest release](https://github.com/CedricConday/protocol-tracker/releases/latest)**

| | |
|---|---|
| Version | 1.0.0 (`versionCode` 4) |
| File | `protocol-tracker-1.0.0.apk` (99 MB) |
| SHA-256 | `bdf843cadc708a40c2e5732e0cfa260efea069a69516249b22907cab82522813` |
| Minimum Android | 7.0 (API 24) |

Verify before installing:

```bash
sha256sum protocol-tracker-1.0.0.apk
```

The build is signed with a self-managed key, not by Google Play, so Android will
ask you to allow installs from your browser or file manager the first time. There
is no iOS build — Apple has no sideloading route, and store submission is deferred.

Installed builds pull OTA updates from the `preview` channel; a new APK is only
needed when native config changes.

---

## Features

- **Daily anchor (T0) schedule** — every reminder fires at `T0 + rule.offset_minutes`, so the day follows the user rather than a fixed clock. Pulse dosing supported.
- **Supplement editor** with form (capsule / tablet / powder / liquid), dose tracking, and stock countdown
- **Calendar** — real month grid with compliance rings, shape-coded markers, and a month summary; doses and journal entries surface on the cells
- **Symptom journal**, **relapse log** with caregiver-facing export, **sleep hygiene scorecard**, **calcium reintroduction log**
- **Compliance tracking** — daily, 30-day, 12-month and 2-year views; printable/shareable report
- **Notifications** — supplement reminders, water reminders, exercise nudges, morning start, missed-dose alerts, end-of-day summary (sound on, HIGH-importance Android channel)
- **Biometric gate** — Face ID / Touch ID on app launch
- **Offline-first** — all data in on-device `expo-sqlite` with versioned migrations. There is no cloud sync: no first-party server exists and none is planned.
- **Multi-language** — English + German (i18n)

Navigation is five bottom tabs — **Calendar · Journal · Home · Summary · Settings** — each with its own stack.

---

## Tech stack

- **Expo SDK** 57 (new architecture enabled)
- **React Native** 0.86 + **React** 19.2
- **TypeScript** 6.0
- **expo-sqlite** for local persistence (versioned migrations)
- **expo-secure-store** for OS-keychain JWT storage
- **expo-local-authentication** for the biometric gate
- **expo-notifications** + **expo-background-fetch** / **expo-task-manager** for scheduling
- **expo-print** + **expo-sharing** for reports
- **@react-navigation** (native-stack + bottom-tabs)
- **Storybook** (react-native-web-vite) for presentational components

Platforms are pinned to **ios** and **android** for dev/build; the web export breaks on the `expo-sqlite` wasm path. Both native bundles export cleanly on aarch64 Linux as of SDK 57 (`npx expo export --platform android|ios`, ~3.3 MB Hermes bytecode each).

---

## Screenshots

Five captures of the current build are published on the product page, [condaydigital.com/tracker](https://condaydigital.com/tracker/) (Today, trackers, history, journal, settings), in English and German. They are not mirrored into this repo; the page is the canonical set. [`assets/screenshots/README.md`](./assets/screenshots/README.md) still lists the naming convention if more are taken.

---

## Getting started

### Prerequisites

- Node.js 20+ (tested on 24.16.0)
- iOS Simulator (Xcode 15+) or Android Studio + emulator, or a physical device with **Expo Go**

### Install + run

```bash
git clone https://github.com/CedricConday/protocol-tracker.git
cd protocol-tracker
npm install
npx expo start            # add --tunnel for a device on another network
```

Scan the QR with Expo Go, or press `i` / `a` in the terminal.

### Checks

```bash
npx tsc --noEmit          # must pass before every commit
npm test                  # vitest — 13 data-layer unit tests
npx expo-doctor           # 21/21 green
```

Tests run on **vitest** in a plain node environment: `src/db/schema.ts` (and with it
`expo-sqlite`) is mocked, so no React Native transform is involved. Component tests would
need a separate RN-aware setup.

### Publish an OTA update

```bash
npx eas-cli update --branch preview --environment preview \
  --message "what changed" --non-interactive
```

`--environment` is required in non-interactive mode (eas-cli 24.x); it is a separate axis
from `--branch` and the command refuses to run without it.

**The branch must match the installed build's channel.** Internal testers run the
`preview` profile APK, so they read the `preview` branch; `--branch production` only
reaches store builds, of which there are none. Nothing publishes automatically — this
repo has no CI workflows at all, so a pushed commit is not a shipped commit. Publishing
and building are both run by hand, from a checkout.

Requires `qemu-user-static` on aarch64 hosts, `runtimeVersion: exposdk:57.0.0`, and `platforms: ["ios","android"]`.

### Build binaries

```bash
npx eas build --profile preview      # internal APK / IPA
npx eas build --profile production   # store submission
```

Store submission is deliberately deferred (Apple's annual fee).

---

## Privacy + security

See [`SECURITY.md`](./SECURITY.md) for the full threat model + reporting policy.

**TL;DR**: all patient data stays on the device. The app talks to no backend of ours — cloud sync is unsupported and every shipped build has it disabled. The two outbound calls that do exist are third-party and documented in [`SECURITY.md`](./SECURITY.md): coordinates to open-meteo.com for the weather card, and an image to whichever AI vendor the user configured a key for.

**iOS lock-screen privacy tip:** *Settings → Notifications → Expo Go → Show Previews → When Unlocked*.

---

## Scope rule

The app ships as a **pure tracker**: the user enters their own data and the app does not diagnose, interpret, or advise. Medical content (pre-loaded protocols, drug-interaction warnings, lab-value interpretation, educational material) was deliberately removed — see [`ROADMAP.md`](./ROADMAP.md). Re-adding any of it is a product decision, not a code cleanup.

---

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) — what was deferred, what was removed and why, and what is under consideration.

---

## License

MIT — see [`LICENSE`](./LICENSE).

---

## Disclaimer

Not medical advice. Discuss all protocol decisions with your prescribing practitioner.
