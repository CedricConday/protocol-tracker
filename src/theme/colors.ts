import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PALETTES, light, type Palette, type ThemeMode } from './palettes';

export type { Palette, ThemeMode } from './palettes';
export { PALETTES, THEME_MODES } from './palettes';

/**
 * The live palette.
 *
 * Same shape as `useLanguage` in src/i18n, and for the same reason: styles are
 * built by `StyleSheet.create` at module load, long before any component
 * mounts, so the tier has to be readable from module scope. `mode` is a module
 * variable; changing it notifies subscribers.
 *
 * Two things read it:
 *
 * 1. `C` — mutated in place rather than replaced, so every `C.text` already
 *    captured in a closure or a JSX prop resolves to the current tier on the
 *    next render. Never destructure it (`const { text } = C` freezes a value)
 *    and never reassign it.
 *
 * 2. `themed()` — wraps a `StyleSheet.create` call so all three tiers are
 *    built once at module load and the right one is handed back on read.
 *
 * A component re-renders on a tier change by calling `useTheme()`. Screens
 * already call `useLanguage()` for the same purpose; `useTheme()` sits beside
 * it. A memoised component that reads colour needs its own call — its props do
 * not change when the tier does.
 */

const THEME_KEY = 'theme_mode';

let mode: ThemeMode = 'light';

type Listener = (mode: ThemeMode) => void;
const listeners = new Set<Listener>();

/** The live palette. Read it, never replace it. */
export const C: Palette = { ...light };

export function getThemeMode(): ThemeMode {
  return mode;
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value !== null && value in PALETTES;
}

/**
 * Switch tiers. In-memory only — `setThemeMode` is what a screen calls, and it
 * persists as well. Exported for the boot path, which has already read the
 * stored value and only needs it applied.
 */
export function applyThemeMode(next: ThemeMode): void {
  if (next === mode) return;
  mode = next;
  Object.assign(C, PALETTES[next]);
  listeners.forEach((l) => l(next));
}

export async function setThemeMode(next: ThemeMode): Promise<void> {
  applyThemeMode(next);
  try {
    await AsyncStorage.setItem(THEME_KEY, next);
  } catch {
    // A tier that does not survive the next launch is better than a crash on
    // a full disk. The switch itself has already taken effect.
  }
}

/**
 * Read the stored tier and apply it. Called once from the boot path, before
 * the first screen renders, so the app never paints light and then flips.
 */
export async function loadThemeMode(): Promise<ThemeMode> {
  try {
    const stored = await AsyncStorage.getItem(THEME_KEY);
    if (isThemeMode(stored)) applyThemeMode(stored);
  } catch {
    // Unreadable storage means the default tier, which is a working app.
  }
  return mode;
}

/**
 * Build a stylesheet in every tier, hand back the one in force.
 *
 * The proxy resolves on property access, which happens during render, so a
 * component that re-renders picks up the new tier without rebuilding anything.
 */
export function themed<T extends object>(make: (c: Palette) => T): T {
  const built: Record<ThemeMode, T> = {
    light: make(PALETTES.light),
    dim: make(PALETTES.dim),
    dark: make(PALETTES.dark),
  };
  return new Proxy({} as T, {
    get: (_target, key) => built[mode][key as keyof T],
    has: (_target, key) => key in built[mode],
    ownKeys: () => Reflect.ownKeys(built[mode]),
    getOwnPropertyDescriptor: (_target, key) => {
      const d = Object.getOwnPropertyDescriptor(built[mode], key);
      return d && { ...d, configurable: true };
    },
  });
}

/** Subscribe this component to tier changes. Returns the current tier. */
export function useTheme(): ThemeMode {
  const [current, setCurrent] = useState<ThemeMode>(mode);
  useEffect(() => {
    const listener: Listener = (next) => setCurrent(next);
    listeners.add(listener);
    if (mode !== current) setCurrent(mode);
    return () => {
      listeners.delete(listener);
    };
  }, [current]);
  return current;
}
