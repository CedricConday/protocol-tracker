# Roadmap

Active backlog and exploration items.

## Deferred — pulled out to ship as a pure tracker (2026-07-01)

The app ships as a **pure tracker**: the user enters everything; the app gives
no medical advice, information, interpretation, or recommendations. The
following were removed for launch and are parked here as future ideas (some
would need medical/regulatory review before returning). Original code is under
`src/_sidelined/` and in git history.

- **Pre-loaded protocols** — per-disease Vitamin D3 doses, doctor notes, protocol descriptions. (Users build their own.)
- **Drug contraindication / interaction warnings** — Lithium/thiazide/calcium/NSAID safety messages, supplement spacing warnings.
- **Food-pairing guidance** — take-with / avoid / absorption tips.
- **Lab target ranges + value interpretation** — target cards, "target X–Y" hints, ↓Low/↑High/✓ judgments, out-of-range alerts.
- **"Protocol tip" insights** + D3-with-meal / magnesium hints.
- **Lab-value alerts** — "Vitamin D critically low → contact your doctor".
- **MRI "12-month overdue" nudge** and **AI report-photo auto-fill**.
- **Micro-CBT coping module** and fatigue-spike detection.
- **Health "awareness day" messages.**
- **Protocol Guide screen** (educational content / news).
- **Dietary "forbidden foods" list.**

## Under consideration

### Journal feature — LLM-backed structuring
**Status:** evaluating
Evaluate **NotebookLM CLI** as the LLM backend for the symptom journal — summarization, query, and entry structuring. Free, fits the scope. A prior LiteLLM-routing approach was prototyped and removed; the goal is now to find the minimum-viable LLM integration that respects the user's privacy posture (user-supplied keys, on-device-first).

## Recently shipped

- Multi-condition disease profiles (MS, lupus, psoriasis, vitiligo, RA, Hashimoto's, Crohn's, T1D)
- Lab trend charts + 12-month overdue MRI alerts
- Biometric gate, pulse dosing, energy credits, strict mode
- Micro-CBT module + dietary note + elevated calcium alert
- Onboarding track selection (simple vs full protocol)
- Lab trends + family sync + coaching style picker

## Open questions

- Cross-platform notification lock-screen privacy parity (currently Android-only via channel `PRIVATE` visibility; iOS relies on user-side Settings)
- Backend sync server reference implementation (currently the client expects a JWT-issuing endpoint; a reference server would help adopters)
- Migration tooling for users upgrading from earlier prerelease builds
