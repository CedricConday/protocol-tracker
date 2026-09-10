# ±30-day Records-screen back-test

Window: 2026-08-11 → 2026-10-10 (61 days, day 31 = real today, TZ=Europe/Berlin)

Post-repair run. See git history for the original findings run (unbounded adherence
window, real-clock anchoring, `/8` display bug, two dead tables) and `e2e/report/audit-2026-09-10.md`.

## Checkpoints — every query useSummaryScreen calls

| checkpoint | sim. date | week rows | streak | adherenceScore(14) | as rendered |
|---|---|---:|---:|---:|---|
| day 1 (30 days before real today) | 2026-08-11 | 7 | 0 | 96 | 96% |
| real today (simulated clock == wall clock) | 2026-09-10 | 7 | 0 | 80 | 80% |
| day 61 (30 days after real today) | 2026-10-10 | 7 | 0 | 91 | 91% |

## Regression checks

- Day-1 score, anchored to the simulated clock: **96%** (was `0.0/8` before the clock-anchoring fix — the window used to look 14 real-days back from the actual test-run date instead of 14 simulated-days back from day 1).
- Real-today score, re-queried after 30 more simulated days were written: **80**, unchanged from the original checkpoint (**80**) — the upper bound now excludes those future rows.
- `sleep_checkins` / `care_surveys`: dropped via migration 14, confirmed absent from 
  `sqlite_master` after this run rather than merely empty.
