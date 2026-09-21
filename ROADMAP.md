# Roadmap

Product direction — what was deferred, what was removed and why, what is being considered.

> **This file holds direction and reasoning, not open tasks.** It records what was
> deferred, what was removed and why. It is not a backlog: nothing here is a commitment
> or a dated plan. Bugs and feature requests belong in GitHub Issues.

## Deferred — pulled out to ship as a pure tracker (2026-07-01)

The app ships as a **pure tracker**: the user enters everything; the app gives
no medical advice, information, interpretation, or recommendations. The
following were removed for launch and are parked here as future ideas (some
would need medical/regulatory review before returning). The original code is in git
history only — there is no `src/_sidelined/` directory (removed 2026-07-01; pointer
corrected 2026-09-10).

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

## Removed — lab results and MRI history (2026-09-17)

Both screens are gone: entering a lab panel or a radiology finding by hand only
put the numbers in a table the app then did nothing with. The path back is a
single tap to log a result and something real done with it — trends the user
did not have to draw themselves, or a report a doctor asked for. Until that
exists, the screens are an empty promise on a medical app.

What is left in place on purpose: the `lab_results` and `mri_scans` tables, the
migrations that create them, and both tables in `exportAllData` — an install
from before today still holds what its user typed, and an export is now the only
way out. Nothing writes them any more. Code is in git at `HEAD` before this
change (`src/screens/LabResultsScreen.tsx`, `src/screens/MriScreen.tsx`), and
the parked vision auto-fill is recorded outside this repo.

## Under consideration

### Journal feature — LLM-backed structuring
**Status:** ~~evaluating~~ **shelved 2026-09-20 on privacy grounds.** Every option on the table, NotebookLM included, sends the journal text to someone else's server, and the app's standing claim is that the data stays on the device. The path back is an on-device model, or a feature that sends counts and moods rather than prose — not a different vendor.
Evaluate **NotebookLM CLI** as the LLM backend for the symptom journal — summarization, query, and entry structuring. Free, fits the scope. A prior LiteLLM-routing approach was prototyped and removed; the goal is now to find the minimum-viable LLM integration that respects the user's privacy posture (user-supplied keys, on-device-first).

## Recently shipped

- Multi-condition disease profiles (MS, lupus, psoriasis, vitiligo, RA, Hashimoto's, Crohn's, T1D)
- Lab trend charts + 12-month overdue MRI alerts
- Biometric gate, pulse dosing, energy credits, strict mode
- Micro-CBT module + dietary note + elevated calcium alert
- Onboarding track selection (simple vs full protocol)
- Lab trends + family sync + coaching style picker

## Known drift (2026-09-10)

Some advisory surfaces survived the pure-tracker cut and are still live: the food-pairing
block in `src/components/DoseDetailModal.tsx` and contraindication fields in
`src/db/schema.ts` / `queries.ts`. Keeping or stripping them is a product decision —
see the git history. _(The 12-month MRI banner went with `MriScreen.tsx` on 2026-09-17.)_

## Open questions

- Cross-platform notification lock-screen privacy parity (currently Android-only via channel `PRIVATE` visibility; iOS relies on user-side Settings)
- Backend sync server reference implementation (currently the client expects a JWT-issuing endpoint; a reference server would help adopters)
- Migration tooling for users upgrading from earlier prerelease builds
