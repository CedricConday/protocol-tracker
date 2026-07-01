# polish/scaleback-cleanup — NOTES

## What was done (4 commits on top of e2195cb)

### 1. OnboardingScreen — empty-state gap (b7a1a9f)
- `patientDescription` text (always `''` after scale-back) now conditionally hidden: the `<Text>` wrapper only renders when the string is non-empty.

### 2. SummaryScreen — dead code from blanked fields (0d17511)
- Removed `profileBlurb` state, its loading logic in `useEffect`, and the orphaned `getProfileById` import.
- Removed unused styles: `profileBlurbCard`, `profileBlurbText`, `doctorModeToggle*`, `doctorConsole*`, `doctorMetric*`, `doctorBtn*`.

### 3. MriScreen — dead camera/AI code (c969574)
- Removed `handleCameraCapture` (~50 lines) and `callVisionApi` (~60 lines).
- Removed `import * as ImagePicker`, `import AsyncStorage` (both only used by dead functions).
- Removed `import { ActivityIndicator }` (unused after scanning UI removed).
- Removed `const [scanning, setScanning]` state (only referenced in dead code).
- Removed orphaned styles: `cameraBtn`, `emptyState`, `emptyText`, `emptySubtext`.

### 4. Unused styles across screens (a22139e)
- `HomeScreen`: removed `hintCard*` (5 styles) — left `insightCard`/`insightLabel`/`insightText` alone (still used in JSX).
- `JournalScreen`: removed `cbt*` (8 styles) — leftover from removed micro-CBT feature.
- `CalciumLogScreen`: removed `warningBanner`/`warningText` — leftover from removed calcium alert.

## Not touched
- `overdueAlert` in MriScreen — intentionally kept disabled (state always false), not camera-related.
- `medical*`, `workspace*`, `streak*`, `sectionTitle`, `week*`, `badge*` styles in SummaryScreen — not in scope.
- `insight*` styles in HomeScreen — verified still used.

## Verify
- `npx tsc --noEmit` = 0 errors on final state.
- Branch not pushed. Claude1 should review with Storybook + tsc.
