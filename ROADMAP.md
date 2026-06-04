# Roadmap

Active backlog and exploration items.

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
