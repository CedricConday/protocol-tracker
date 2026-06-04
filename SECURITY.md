# Security Policy

## Threat model

Protocol Tracker is an on-device mobile app for tracking high-dose Vitamin D3 protocols (medical-grade supplementation). The app handles patient health information (PHI) and is designed for single-user, on-device operation with optional cloud sync.

### What the app does with sensitive data

- **Local storage**: dose logs, lab results, MRI scan records, symptom journals, and user profile are stored in a local SQLite database in the app sandbox
- **Authentication**: optional cloud sync uses JWT bearer tokens stored in the OS keychain via `expo-secure-store`
- **AI vision**: MRI report images can be sent to user-supplied LLM providers (Anthropic / OpenAI / Groq) for OCR — the user provides their own API key and chooses the provider
- **Biometric gate**: Face ID / Touch ID via `expo-local-authentication` gates app entry
- **Notifications**: local scheduled notifications include supplement names and patient name

### Current security posture

- ✅ Parameterized SQL queries throughout
- ✅ JWT in OS keychain (`expo-secure-store`)
- ✅ Bearer auth on all sync endpoints
- ✅ 401 → automatic token invalidation
- ✅ Biometric authentication on app launch
- ✅ TLS for all third-party requests
- ✅ No baked secrets in source
- ✅ Image quality capped at 0.6 + 256-token cap on LLM responses
- 🟡 AI API key currently stored in `AsyncStorage` (planned migration to `expo-secure-store`)
- 🟡 SQLite not encrypted at rest (relies on iOS Data Protection / Android encrypted partition)

### Privacy recommendation for users

On iOS, the most effective lock-screen privacy improvement is system-level:
- **iPhone Settings → Notifications → Protocol Tracker → Show Previews → When Unlocked** (or Never)

This prevents notification content (supplement names, patient name) from appearing on the lock screen when the phone is locked.

On Android, the app sets notification channels to `PRIVATE` visibility, hiding content automatically when the device is locked.

## Reporting a vulnerability

Please report security issues by opening a GitHub Security Advisory on this repository (Security tab → Advisories → New draft security advisory), or by emailing the maintainer through the GitHub no-reply address listed on the commit history.

We aim to acknowledge reports within 72 hours and to issue a fix or mitigation guidance within 30 days for confirmed vulnerabilities.

## Scope

**In scope:**
- Code in this repository
- Dependency vulnerabilities surfaced via `npm audit`
- Authentication, storage, and data-handling flaws

**Out of scope:**
- Third-party LLM provider security (Anthropic / OpenAI / Groq)
- User device security (jailbreak / root scenarios)
- Network infrastructure between user device and sync backend (TLS termination, etc.)
- Social-engineering scenarios involving access to the user's unlocked device

## Disclaimers

This app is provided "as is" and is **not a substitute for medical advice**. Users should consult their prescribing practitioner for any decisions affecting their treatment protocol. The maintainer accepts no liability for medical outcomes resulting from use of this software.
