# Protocol Tracker

> Mobile companion for high-dose Vitamin D3 protocol patients.

Protocol Tracker is a React Native / Expo app for tracking supplement schedules, dose compliance, lab results, MRI scan history, symptoms, and recovery progress on a high-dose Vitamin D3 therapy protocol. Built for autoimmune-disease patients (multiple sclerosis, lupus, psoriasis, vitiligo, rheumatoid arthritis, Hashimoto's, Crohn's, type 1 diabetes) who follow strict daily protocols requiring precise timing, dose stacking discipline, and long-horizon tracking.

> **Origin**: built to help a partner manage a high-dose Vitamin D3 therapy for autoimmune disease. Generalizes to any patient following a structured supplementation protocol with timing windows, contraindication tracking, and lab-driven titration.

---

## Features

- **Daily anchor (T0) schedule** — dose timing flows from a daily anchor; pulse dosing supported
- **Supplement editor** with form (capsule / tablet / powder / liquid), dose tracking, and stock countdown
- **Contraindication rules** — alerts for incompatible medications (e.g., Lithium Carbonate, thiazide diuretics, calcium supplements)
- **Lab results tracking** — Vitamin D, calcium, PTH, creatinine, NFL/PGL, and more, with 12-month trend charts and high-dose risk-flag banners
- **MRI scan log** with 12-month overdue alerts and optional camera-based OCR auto-fill (user-supplied LLM API key)
- **Symptom journal** with fatigue alerting and micro-CBT prompts
- **Relapse log** with caregiver-facing summary export
- **Sleep hygiene scorecard** + **calcium reintroduction log**
- **Compliance tracking** — daily, 30-day, 12-month, and 2-year roadmap views
- **Notifications** — supplement reminders, water reminders, exercise nudges, morning start, missed-dose alerts, end-of-day summary
- **Biometric gate** — Face ID / Touch ID on app launch
- **Offline-first** — full SQLite local storage; optional cloud sync via JWT-authenticated backend
- **Multi-language** — English + German (i18n)

---

## Tech stack

- **React Native** 0.81 + **React** 19
- **Expo SDK** 54 (new architecture enabled)
- **TypeScript** 5.9
- **expo-sqlite** for local persistence (versioned migrations)
- **expo-secure-store** for OS-keychain JWT storage
- **expo-local-authentication** for biometric gate
- **expo-notifications** + **expo-background-fetch** for scheduling
- **expo-camera** + **expo-image-picker** for MRI report capture
- **@react-navigation** (native-stack + bottom-tabs)

---

## Screenshots

See [`assets/screenshots/`](./assets/screenshots/) for current screen captures.

> *(Screenshots will be added as the app stabilizes. Daily-use flows: onboarding → home → schedule → summary; long-term tracking: lab results, MRI history, journal.)*

---

## Getting started

### Prerequisites

- Node.js 20+ (tested on 24.16.0)
- Expo CLI: `npx expo` (installed via project)
- iOS Simulator (Xcode 15+) or Android Studio + emulator
- Or a physical device with **Expo Go** installed (iOS / Android)

### Install + run

```bash
git clone https://github.com/CedricConday/protocol-tracker.git
cd protocol-tracker
npm install
npx expo start
```

Scan the QR code with Expo Go on your device, or press `i` (iOS sim) / `a` (Android emulator) in the terminal.

### Build for production

Configured for **EAS Build** — see `eas.json`:

```bash
npx eas build --profile preview   # internal APK / IPA for testing
npx eas build --profile production # store submission
```

---

## Privacy + security

See [`SECURITY.md`](./SECURITY.md) for the full threat model + reporting policy.

**TL;DR**: all patient data is on-device by default. Optional cloud sync uses JWT bearer tokens stored in the OS keychain. The MRI camera flow sends images to user-chosen LLM providers (Anthropic / OpenAI / Groq) — only if the user provides their own API key.

**iOS lock-screen privacy tip:** for maximum notification privacy, set *Settings → Notifications → Protocol Tracker → Show Previews → When Unlocked* on your iPhone.

---

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md).

---

## License

MIT — see [`LICENSE`](./LICENSE).

---

## Disclaimer

Not medical advice. Discuss all protocol decisions with your prescribing practitioner.
