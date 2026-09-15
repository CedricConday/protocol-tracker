# Cut C — portfolio (~42 s, 1920x1080, silent)

Audience: engineers and hiring managers. Use: profile, portfolio, technical posts.
House style, same as the MailerLite piece: no faces, no voice, terminal and screens.

| # | Dur | Beat | On screen | Verified |
|---|---|---|---|---|
| 1 | 4.0 s | Title | "A local-first medical adherence app" · MIT | `LICENSE` |
| 2 | 7.0 s | Type check | `npx tsc --noEmit` → exit 0 | Run 2026-09-13 on this box, exit 0 |
| 3 | 6.0 s | Stack | Expo SDK 57, RN 0.86, React 19.2, TS 6.0 | `package.json`, read 2026-09-13 |
| 4 | 6.5 s | Surface | Five tabs, 21 routes, 16 screen modules | `grep name=` in `src/navigation` → 21 unique; `ls src/screens` → 16 |
| 5 | 7.0 s | The core | `t0Ms + rule.offset_minutes * 60 * 1000` | `src/engine/scheduler.ts:39`, verbatim |
| 6 | 6.0 s | Why it matters | Anchored time vs clock time | Design rationale, stated as rationale not as result |
| 7 | 6.0 s | End card | MIT, repo `‹SET WHEN PUBLIC›` | Repo is private as of 2026-09-13 |

**Not on screen, on purpose:** `expo-doctor` was 20/21 on 2026-09-13 (one check failed
— 15 packages behind the SDK's pinned versions). STATUS.md's "21/21 green" is from
2026-09-10 and has decayed. The Hermes bundle size in STATUS.md was not re-verified,
so it is not claimed here either.

## Narration

Voice: piper `en_GB-jenny_dioco-medium`, length-scale 1.12. Each scene stretches to
fit its line, so the durations in the table above are the silent cut.

1. “Protocol Tracker. A local-first medical adherence app, built for high-dose vitamin D patients.”
2. “Type clean, checked today.”
3. “Expo S.D.K. fifty-seven on the new architecture, with an on-device SQLite database as the source of truth.”
4. “Five tabs, twenty-one routes, sixteen screen modules.”
5. “The whole product is this line.”
6. “One patient's day starts at ten past six, another's at twenty to twelve. Every dose, reminder and score is computed from their own anchor.”
7. “M.I.T. licensed. Built by Cedric Conday.”
