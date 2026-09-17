# Protocol Tracker

> Mobile companion for high-dose Vitamin D3 protocol patients.

Protocol Tracker is a React Native / Expo app for tracking supplement schedules, dose compliance, lab results, MRI scan history, symptoms, and recovery progress on a high-dose Vitamin D3 therapy protocol. Built for autoimmune-disease patients (multiple sclerosis, lupus, psoriasis, vitiligo, rheumatoid arthritis, Hashimoto's, Crohn's, type 1 diabetes) who follow strict daily protocols requiring precise timing, dose stacking discipline, and long-horizon tracking.

> **Origin**: built for one patient manage a high-dose Vitamin D3 therapy for autoimmune disease. Generalizes to any patient following a structured supplementation protocol with timing windows and lab-driven titration.

**Status:** feature-complete private build, not yet publicly released. Distributed through Expo Go + EAS Update; no App Store / Play Store listing yet.

---

## Features

- **Daily anchor (T0) schedule** — every reminder fires at `T0 + rule.offset_minutes`, so the day follows the user rather than a fixed clock. Pulse dosing supported.
- **Supplement editor** with form (capsule / tablet / powder / liquid), dose tracking, and stock countdown
- **Calendar** — real month grid with compliance rings, shape-coded markers, and a month summary; doses and journal entries surface on the cells
- **Lab results tracking** — Vitamin D, calcium, PTH, creatinine, NFL/PGL and more, with 12-month trend charts
- **MRI scan log** with photo/camera capture of reports
- **Symptom journal**, **relapse log** with caregiver-facing export, **sleep hygiene scorecard**, **calcium reintroduction log**
- **Compliance tracking** — daily, 30-day, 12-month and 2-year views; printable/shareable report
- **Family sync + caregiver view** — invite-code based sharing screens
- **Notifications** — supplement reminders, water reminders, exercise nudges, morning start, missed-dose alerts, end-of-day summary (sound on, HIGH-importance Android channel)
- **Biometric gate** — Face ID / Touch ID on app launch
- **Offline-first** — all data in on-device `expo-sqlite` with versioned migrations; optional cloud sync against a JWT-issuing backend (no reference server shipped yet)
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
- **expo-camera** + **expo-image-picker** for MRI report capture
- **expo-print** + **expo-sharing** for reports
- **@react-navigation** (native-stack + bottom-tabs)
- **Storybook** (react-native-web-vite) for presentational components

Platforms are pinned to **ios** and **android** for dev/build; the web export breaks on the `expo-sqlite` wasm path. Both native bundles export cleanly on aarch64 Linux as of SDK 57 (`npx expo export --platform android|ios`, ~3.3 MB Hermes bytecode each).

---

## Screenshots

None captured yet. [`assets/screenshots/README.md`](./assets/screenshots/README.md) lists the eight captures to take and the naming convention.

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
reaches store builds, of which there are none. Nothing publishes automatically — no CI
job, hook or timer runs this, so a pushed commit is not a shipped commit.

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

**TL;DR**: all patient data is on-device by default. Optional cloud sync uses JWT bearer tokens stored in the OS keychain.

**iOS lock-screen privacy tip:** *Settings → Notifications → Expo Go → Show Previews → When Unlocked*.

---

## Scope rule

The app ships as a **pure tracker**: the user enters their own data and the app does not diagnose, interpret, or advise. Medical content (pre-loaded protocols, drug-interaction warnings, lab-value interpretation, educational material) was deliberately removed — see [`ROADMAP.md`](./ROADMAP.md). Re-adding any of it is a product decision, not a code cleanup.

---

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md). Build sign-off and the remaining launch checklist: [`BUILD_NOTES_2026-07-07.md`](./BUILD_NOTES_2026-07-07.md) and [`STATUS.md`](./STATUS.md).

---

## License

MIT — see [`LICENSE`](./LICENSE).

---

## Disclaimer

Not medical advice. Discuss all protocol decisions with your prescribing practitioner.
