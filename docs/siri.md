# Siri Shortcut — Implementation Plan

## Status: Requires EAS Custom Build

Siri Shortcuts integration requires native modules that are not available in Expo Go.
The following path documents the buildable V1 workaround.

## Current Implementation

Deep link handler `coimbra://start-day` has been added in `App.tsx`:
- When the URL `coimbra://start-day` is opened, it navigates to the Home tab
- Auto-triggers the `startDay()` sequence
- Other deep link paths can be added following the same pattern

A "Add Siri Shortcut" button is in SettingsScreen "ADVANCED" section.

## To Build Real Siri Integration

1. Build with `eas build --platform ios` (development or production)
2. Use `expo-intent-launcher` or native Siri Shortcut module
3. Define INInteraction for "Start Day" intent
4. Donate the shortcut on first start-day action
5. Handle INIntentResponse to call the deep link

## Deep Link Routes

- `coimbra://start-day` → Start the daily protocol sequence
- `coimbra://log/{supplement_id}` → Quick-log a specific supplement
- `coimbra://journal` → Open journal screen

Add new handlers in App.tsx `Linking.addEventListener` callback.
