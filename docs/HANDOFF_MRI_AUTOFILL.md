# MRI report auto-fill — parked 2026-09-16, for a later update

Removed from the shipped app, deliberately, to be brought back as a surprise
feature. This is the note that makes that possible; the code itself is in git at
`5ff8bcd~1` (`src/screens/MriScreen.tsx`, `callVisionApi`).

## What it was

Photograph an MRI report, send the image to a vision model, parse the returned
JSON into the MRI form — date, facility, scan type, new lesions, enhancing
lesions, assessment. Three providers behind a segmented control in
Settings → Advanced → AI Workspace: Groq (`llama-4-scout-17b`), OpenAI
(`gpt-4o-mini`), Anthropic (`claude-haiku-4-5`). The key lived in SecureStore.

## Why it came out

1. **It was already unreachable.** MriScreen's camera button had been removed for
   the pure-tracker build, so nothing could call `handleCameraCapture`. What
   shipped was dead code plus a Settings row collecting an API key for a feature
   that could not run.
2. **It contradicted the app's own promise.** Onboarding says *"Your health data
   stays on your device. None of it reaches our servers — we do not run one."*
   That stays literally true when the image goes to Groq rather than to us, and
   no patient or Datenschutzbeauftragter will read it that way.
3. **No consent step existed.** No dialogue, no per-use confirmation, nothing
   naming the third party before an image of a named patient's MRI report left
   the phone.
4. **It required the patient to hold an API key.** Realistically that is Cedric
   and nobody else, so the exposure bought close to zero delivered value.

## What the revival has to include, or it comes out again

- **On-device OCR first.** If nothing leaves the phone, points 2-4 all disappear.
  That is the defensible shape and it needs no key, no consent screen and no AVV
  clause. Try this before anything network-bound.
- If a network model is genuinely necessary: an explicit per-use consent screen
  naming the processor, a DPA with that processor, the promise copy in
  onboarding rewritten to match, and the processor named in the clinic AVV.
- Either way: **no patient-supplied API keys.** A feature a patient must hold a
  credential for is not a feature they will use.

## Where the pieces went

- `MriScreen.tsx` — `handleCameraCapture`, `callVisionApi`, `readSecret`, the
  `scanning` state, the `expo-image-picker` and AsyncStorage imports.
- `SettingsScreen.tsx` — the whole Advanced group, `aiProvider` / `aiApiKey`
  state, their baseline and dirty-check entries, the SecureStore helpers.
- `i18n/{en,de}.ts` — 13 keys each: `advancedGroup`, `aiWorkspace*`, `ai*Label`,
  `mriPerm*`, `mriKey*`, `mriParse*`, `mriScan*`.
- `expo-image-picker` is still in package.json; left alone in case another
  screen wants the camera.

The manual MRI form is untouched and is what users have today.
