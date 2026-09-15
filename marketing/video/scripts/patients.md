# Cut A — patients (~35 s, 1920x1080, silent)

Audience: someone already on a high-dose Vitamin D3 protocol, or about to start one.
Use: Play Store listing video, landing page hero.
Tone: calm, factual, no urgency, no promise of outcomes.

| # | Dur | Beat | On screen | Source of the claim |
|---|---|---|---|---|
| 1 | 4.5 s | Open | Mascot + wordmark, "The day starts when you do." | Brand asset `assets/mascot.png` |
| 2 | 6.5 s | T=0 anchor | Today screen; "You set the anchor. The app schedules the rest." | `src/engine/scheduler.ts:39` — `t0Ms + rule.offset_minutes * 60 * 1000` |
| 3 | 6.0 s | Logging | Journal screen; "Log a dose. Log how you feel. Move on." | Journal screen capture 2026-09-11 |
| 4 | 7.0 s | The long view | Calendar card, rings, "8 days logged · 88% avg" visible | Capture `8-seeded-history.png`; windows from README |
| 5 | 5.5 s | Privacy | "Your data stays on your phone." | `expo-sqlite` local DB, `expo-local-authentication` gate, no account required |
| 6 | 6.0 s | End card | "Free. Android first." + disclaimer | MIT `LICENSE`; no IAP/ads deps in `package.json` |

Rules honoured: no medical claim anywhere; "Testpatient" capture, never a real name;
the 88% on screen is the seeded figure the app itself computed, not a chosen number.

## Narration

Voice: piper `en_GB-jenny_dioco-medium`, length-scale 1.12. Each scene stretches to
fit its line, so the durations in the table above are the silent cut.

1. “Protocol Tracker. The day starts when you do.”
2. “You set the anchor when your day begins, and every dose is scheduled from that moment. The protocol follows your morning, instead of a fixed clock.”
3. “Log a dose. Log your water, your mood, how you slept. One tap each, saved as you go.”
4. “Every day you log builds the record. A ring for each day, an average for the month, and longer views when your practitioner asks.”
5. “It all stays on your phone. An on-device database, a fingerprint or face unlock, and no account to create.”
6. “Protocol Tracker. Free, on Android. Not medical advice. Discuss all results with your prescribing practitioner.”
