# Build notes & sign-off — Expo Go rewire (2026-07-07, overnight)

**Branch:** `expo-go-rewire-2026-07-07` (master untouched at `817b449`). Review, then
merge if you approve. Nothing here touches the **T0** logic.

## What I found (grounded in the code, not assumption)
1. **The app is ALREADY Expo-Go-compatible.** `App.tsx` and the T0 notification path
   import only Expo-Go-safe modules: `expo-notifications`, `expo-sqlite`,
   AsyncStorage. There is no rebuild needed — you can `expo start` and scan.
2. **The dev-build-only modules are isolated spikes**, unreachable from real code:
   `@notifee/react-native` (only `notifeeDemo.ts`), `@powersync/*` (only `src/db/powersync/*`),
   `drizzle-orm` (only `src/db/drizzle/*`), `@journeyapps/react-native-quick-sqlite`
   (only referenced in app.json). None are imported by any screen, hook, or App.tsx.
3. **T0 is intact and is the crown jewel.** `startDay(t0)` writes `daily_anchors.t0_timestamp`;
   every dose fires at `t0 + rule.offset_minutes`. Real DB = `expo-sqlite` (`coimbra.db`).
   **Not touched.**
4. **Notification SOUND is wired in code** — `sound: true` on all 6 notification types,
   `shouldPlaySound: true` handler, HIGH-importance `supplements` Android channel. The
   native app *can* play iOS notification sound (real local notifications); the PWA could
   not (that iOS limit is what killed the PWA). Uses OS default sound (custom = optional).

## What I changed (the only change)
- **Removed `@journeyapps/react-native-quick-sqlite` from `app.json` plugins** — an unused
  spike that conflicts with `expo-sqlite` on prebuild/EAS. One line. Reversible.

## How I verified (what I could without your devices)
- `tsc --noEmit` → **green** (before and after).
- `expo config` → **valid**.
- Full Android Metro bundle → **1,153 modules resolved at 100%.** (The Hermes bytecode
  step fails only because this VPS is aarch64 and the bundled `hermesc` is x86-64 — an
  environment limitation, not an app problem. Expo Go doesn't use that step.)
- **I did NOT run it on a device** (no device, no Expo login here) — so the items below
  marked 📱 are genuinely yours to close.

## THE TASK LIST — from the build (what's left to ship & launch)

### 📱 Only you can close (device / account)
- [ ] **Publish + get the QR.** `npx expo start --tunnel` (quick) or `eas update` (persistent
      link) from *your* Expo login. Paste the QR/URL into `USER_INSTALL_GUIDE.md`.
- [ ] **Hear the reminder sound** on your iPhone and the first user's phone (code says it should
      play; confirm with your ears). This is the make-or-break for the first user.
- [ ] **Confirm data survives** a force-quit + reopen in Expo Go (local-first integrity).
- [ ] **Give it to the first user** and watch one real day (Start My Day → doses → reminders).

### 💻 I can do next session (no device needed)
- [ ] **Clean up the dead spikes** — remove Notifee/PowerSync/Drizzle deps + files so
      `package.json` honestly reflects the Expo Go app (needs a reinstall + your device
      retest before merge; that's why I didn't do it blind tonight).
- [ ] **Feature diff vs the web build (v2.1.0).** The web/Capacitor build has a richer
      surface (on-device RAG "knowledge Assistant", fuller Coimbra content). Decide what,
      if anything, ports to the native app for the "best version." *Recommendation: launch
      the native app as-is first (it's the pure tracker the first user needs); port later.*
- [ ] **Bump launch metadata** — app.json is still `version 1.0.0`; set the real version +
      confirm icon/splash before the Facebook launch.

### 🅿️ Parked (post-launch)
- [ ] EAS dev/prod build (removes Expo Go dependency; needs the $99 Apple fee for the App
      Store — deliberately deferred until there's budget/traction).
- [ ] iOS lock-screen notification privacy parity; sync-server reference; upgrade migration
      tooling (from ROADMAP.md open questions).

## Bottom line
The native app is real, coherent, Expo-Go-ready, and its notifications (with sound) are the
thing the PWA couldn't do. The remaining work to *launch* is mostly on-device confirmation
that I can't do from here — not more building.
