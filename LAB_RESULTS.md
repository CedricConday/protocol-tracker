# Lab Results — 4-lib spike

> **Historical record.** The `src/db/powersync/*` and `src/db/drizzle/*` paths named below
> no longer exist in any branch — the spike modules were removed in `01815af`
> ("cleanup: remove dead spike modules"). Read them as a log of what was tried, not as
> live pointers. _Noted 2026-09-10._

## Drizzle ✅ (reference — done before this session)
- Install: clean (`drizzle-orm` + `drizzle-kit` in existing deps)
- tsc: passes
- Build: N/A (type-only layer over expo-sqlite)
- Notes: Typed queries over existing SQLite. Low friction, no native modules.
  Winner for type-safe local queries in the real app.

## Notifee ✅ (reference — done before this session)
- Install: clean (`@notifee/react-native`)
- tsc: passes
- Build: N/A (native module, needs dev build)
- Notes: Interactive notification actions (Taken/Skip) + timestamp triggers.
  High value for dose reminders. Winner if native build is acceptable.

## Storybook ✅ (TASK 1)
- Install: packages were already present; `react-native-web` was missing from
  node_modules and needed `npm install react-native-web --legacy-peer-deps`.
- tsc: passes
- Build: `npx storybook build` succeeds (336 modules, 1.79s)
- Stories created: EmptyState (2 stories), WaterTracker (3 stories),
  SunTracker (3 stories) — all presentational, no DB imports.
- Friction points:
  - `react-native-web` not actually installed (listed in handoff as "already
    installed" but absent from package.json/node_modules).
  - Vite warns about `vite-tsconfig-paths` being redundant and `react-native`
    → `react-native-web` alias not being absolute (benign).
  - Storybook 10 + Vite 8 works clean with `@storybook/react-native-web-vite`.
- Verdict: Low friction for the "preview in browser" goal. If a component
  transitively imports `expo-sqlite` (native module), the Vite build will
  fail — stories must stay DB-free or stub the native dependency.

## PowerSync ✅ (TASK 2)
- Install: `npx expo install @powersync/react-native @powersync/react` clean;
  then needed `@journeyapps/react-native-quick-sqlite` as peer dep.
- tsc: passes
- Build: N/A (native module, needs dev build)
- Files created:
  - `src/db/powersync/schema.ts` — 4 tables (supplements, schedule_rules,
    dose_logs, daily_anchors) using PowerSync Table V2 API with column builders.
  - `src/db/powersync/client.ts` — `PowerSyncDatabase` instance, local-only.
  - `src/db/powersync/demo.ts` — `watch()` query demo.
- Friction points:
  - PowerSync requires a native SQLite adapter (`@journeyapps/react-native-
    quick-sqlite`); adds config plugin to app.json.
  - Full evaluation requires a backend (Postgres/Supabase) for sync testing.
  - API is well-typed (Schema, Table, column builders) with good TS ergonomics.
  - `watch()` returns `AsyncIterable<QueryResult>` — no generic type param,
    rows are cast on the consumer side.
- Verdict: Powerful for apps that need sync, but heavy if you only need local
  queries. Drizzle is lighter for local-only. PowerSync wins if the roadmap
  includes backend sync.
