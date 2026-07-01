# flagship-polish-batch notes

1. **Calcium history UI** — Added `getCalciumLogs()` fetch + grouped past-test list below the form in `CalciumLogScreen.tsx`.
2. **Sleep history UI** — Added `getSleepCheckins()` query in `queries.ts` + past check-in list below the form in `SleepScreen.tsx`.
3. **Water-reminder stale value** — Moved stale cumulative `waterMl` out of scheduled notification body; now reads live `getWaterProgress()` in `addNotificationReceivedListener` instead.
4. **getStreak cap** — Raised look-back window from 60 → 120 days in `getStreak()`.
5. **GitHub Actions CI** — Added `.github/workflows/ci.yml` (Node 20, `npm ci`, `npx tsc --noEmit`).

Nothing unsure. Branch unpushed.
