# e2e — driving the app without a phone

The Expo **web** target renders the same React tree, the same SQLite schema
(expo-sqlite runs on wa-sqlite in the browser) and the same navigation as the
device build. Playwright drives it. That turns "does this screen work" from a
human tapping a phone into a script anyone — or any agent — can run.

## Run it

```sh
npm run e2e:serve          # terminal 1: expo web on :8085 (leave running)
npm run e2e                # terminal 2: all flows
npm run e2e onboarding     # one flow by name
```

### Playwright

Playwright is not a dependency of this app — it is several hundred megabytes of
browsers that the shipped bundle never touches, so the harness borrows whatever
copy the machine already has. `e2e/lib/playwright.mjs` looks in three places, in
order: `$PT_PLAYWRIGHT` (an absolute path to `index.mjs`), a normal resolution
from `node_modules`, then an npx-cached copy under `~/.npm/_npx/`. If you have
none of those:

```sh
npm i -D playwright && npx playwright install chromium
```

Output lands in `e2e/report/`:

- `report.md` — the human-readable audit
- `report.json` — same thing, machine-readable
- `shots/` — a screenshot per step, per flow

Every run starts from a fresh browser context, so the app boots as a brand-new
install with an empty database.

## Writing a flow

A flow is a file in `e2e/flows/` exporting `{ name, description, run(ctx) }`.
`ctx` gives you `tap(text)`, `fill(placeholder, value)`, `sees(text)`,
`text()`, `shot(name)`, and the raw `page`.

A flow **reports**, it does not assert-and-die. Push a `{ summary, detail }`
onto `findings` for anything wrong and keep walking — one run should surface
every problem on the path, not just the first. Runtime console errors and
uncaught exceptions are collected automatically.

## What is real and what is web-only

The web target is a proxy, not the device. Before filing a finding, check it is
not one of these:

- **Native-only modules no-op on web** — haptics, notifications categories,
  local auth, camera, secure store. `session.mjs` filters the known ones.
- **`useNativeDriver` warnings** are expected on web; animations still run.
- **Keyboard behaviour differs.** Return-key chaining, `KeyboardAvoidingView`
  and numeric keypads do not behave like a phone. Layout under the keyboard is
  not testable here.
- **Anything gated on a real notification, background task, or biometric**
  cannot complete on web.

Layout findings are worth trusting only when the box model says so — measure
via `page.evaluate(() => el.getBoundingClientRect())` rather than eyeballing a
screenshot.

## The loop

1. A tester agent runs the flows, explores the app, and writes findings into
   `e2e/report/audit-<date>.md` — each one a symptom, the reproduction, the
   suspected file, and a **proposed** fix.
2. Cedric reviews the audit and marks each finding approved or dropped.
3. Only then does anyone edit source.

The tester never fixes anything. An audit that also changed the code is not an
audit — it is an unreviewed commit.
