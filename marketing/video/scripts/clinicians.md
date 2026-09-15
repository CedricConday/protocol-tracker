# Cut B — clinicians (~42 s, 1920x1080, silent)

Audience: the prescribing practitioner, who sees the patient twice a year and has no
visibility in between. Use: practice outreach, medtech positioning.
Tone: flat and clinical. It describes a record, never an outcome.

| # | Dur | Beat | On screen | Source of the claim |
|---|---|---|---|---|
| 1 | 4.5 s | Frame | "What happens between appointments." | — |
| 2 | 6.5 s | Adherence | Real Summary card, 91% weighted adherence | Capture `7-seeded-records.png`; app's own caption: "14-day weighted score based on completeness and timing" |
| 3 | 6.5 s | Timing | Today screen; doses anchored to T0, not wall clock | `src/engine/scheduler.ts`, `offset_minutes` in `src/db/schema.ts:49` |
| 4 | 6.5 s | What is tracked | Vitamin D, calcium, PTH, creatinine, NFL; MRI; symptom/relapse/sleep/calcium logs | README feature list, `src/screens/LabResultsScreen.tsx`, `MriScreen.tsx` |
| 5 | 6.5 s | At a glance | Calendar card + legend thresholds ≥80 / 50–79 / <50 | Legend is rendered by the app, read off the capture |
| 6 | 6.0 s | The deliverable | Printable report, caregiver export, patient-initiated share | `ReportScreen.tsx`, `CaregiverScreen.tsx`, `expo-print` + `expo-sharing` |
| 7 | 6.0 s | End card | "On-device. No clinic account to procure." + disclaimer | Local-first architecture; cloud sync is optional and off by default |

Deliberately absent: any efficacy statement about the protocol itself, any comparison
to standard care, any claim that use of the app changes a clinical result.

## Narration

Voice: piper `en_GB-jenny_dioco-medium`, length-scale 1.12. Each scene stretches to
fit its line, so the durations in the table above are the silent cut.

1. “What happens between appointments.”
2. “A weighted adherence score, not a self-report. Completeness and timing both count, and missed or late doses stay visible.”
3. “Doses are anchored to the patient's own start time, not to the wall clock. A late start shifts the whole day, rather than scoring it as failure.”
4. “Vitamin D, calcium, parathyroid hormone, creatinine and neurofilament light, charted over twelve months. M.R.I. reports, symptoms, relapses and sleep each have their own log.”
5. “Day-level compliance you can read in one pass. Green at eighty percent or above, amber between fifty and seventy-nine, red below fifty.”
6. “And it leaves the phone as a document. A printable compliance report, a caregiver export, shared by the patient when they choose.”
7. “On device. No clinic account to procure. Not medical advice. Discuss all results with the prescribing practitioner.”
