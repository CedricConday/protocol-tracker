# iOS Home Screen Widget — Implementation Plan

## Status: Requires EAS Custom Build

Native WidgetKit widgets cannot be built with Expo Go. They require:
1. An Expo development build (EAS Build)
2. `expo-dev-client` for local testing
3. `@bacons/apple-targets` or manual Xcode widget target setup

## Current Implementation

A "Widget Preview" card has been added to `SummaryScreen.tsx` that shows today's compliance
in a 2x2 bordered card styled to match the look of an iOS widget.

An "Add to Home Screen" button launches the iOS Share Sheet, allowing the user to create a
web clip bookmark on the home screen as a stopgap.

## To Build the Real Widget

1. Run `npx expo install @bacons/apple-targets`
2. Run `npx expo customize widget` to generate the widget target
3. Configure widget to display today's compliance % from the shared app group container
4. Add App Groups capability and configure SQLite to use the shared container
5. Build with `eas build --platform ios`

## App Group Setup

- App Group ID: `group.com.coimbra.patient`
- Move SQLite database to shared container path
- Widget reads compliance from the shared DB or via UserDefaults suite

## Data Flow

Widget -> AppGroup UserDefaults (updated on each dose log) -> displays compliance ring + streak
