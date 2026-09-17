import { useCallback, useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { en } from './en';
import { de } from './de';

/**
 * Translation.
 *
 * The language follows the PHONE until the user says otherwise (2026-09-17).
 * `lang` defaulted to 'en' with no device check at all, so a German phone came
 * up in English and stayed there unless its owner found the switch in Settings
 * — in an app whose other language is the one most of its users speak.
 * `deviceLanguage()` is read at boot by `getLanguage()`; an explicit choice is
 * stored and always wins.
 *
 * Two things changed on 2026-09-14, both of which the German pass needs:
 *
 * 1. `lang` is still a module variable — `t()` has to stay callable outside a
 *    component (notifications, the PDF, autoReport) — but changes to it now
 *    notify subscribers. Before this, switching language re-rendered only the
 *    screen holding the switch: every other mounted screen kept its English
 *    strings until it happened to remount. Components read the language through
 *    `useLanguage()`, which subscribes.
 *
 * 2. `t()` interpolates. German is not English with different words — the verb
 *    moves, the object takes a case — so a sentence cannot be built by
 *    concatenating translated fragments. Every string with a value in it is one
 *    key with named placeholders: t('notifWaterBody', { name, amount, goal }).
 */

export const LANGUAGES = ['en', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];

const LANG_KEY = 'language';
const strings: Record<string, Record<string, string>> = { en, de };

let lang: Language = 'en';

type Listener = (lang: Language) => void;
const listeners = new Set<Listener>();

function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as readonly string[]).includes(value);
}

export function getCurrentLanguage(): Language {
  return lang;
}

/**
 * The phone's own language, as a tag this app has strings for.
 *
 * Read without `expo-localization`: the three sources below need no new native
 * dependency, which for one string at boot is the cheaper path. Each is wrapped
 * because all three are absent on some platform or build — Intl is missing from
 * a Hermes built without it, and the NativeModules entries are per-platform.
 *
 * Anything that is not German lands on English, which is the fallback table.
 */
export function deviceLanguage(): Language {
  const tags: (string | undefined)[] = [];

  try {
    tags.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // No Intl in this build.
  }

  try {
    if (Platform.OS === 'ios') {
      const settings = NativeModules.SettingsManager?.settings;
      tags.push(settings?.AppleLocale, settings?.AppleLanguages?.[0]);
    } else {
      tags.push(NativeModules.I18nManager?.localeIdentifier);
    }
  } catch {
    // Not every build exposes these; the default below is still correct.
  }

  const tag = tags.find((t) => typeof t === 'string' && t.length > 0);
  // `de`, `de-DE`, `de_AT`, `De-CH` — the language subtag is all that matters.
  return tag && /^de\b/i.test(tag.replace('_', '-')) ? 'de' : 'en';
}

/**
 * The stored preference, or the phone's language if there is no preference yet.
 *
 * The device fallback is deliberately NOT written back to storage: until the
 * user chooses in Settings, a phone switched to German should come up in German
 * on the next launch too. `setLanguage` is the only thing that persists, so
 * "what the phone says" and "what the user asked for" stay distinguishable.
 */
export async function getLanguage(): Promise<Language> {
  let next: Language;
  try {
    const stored = await AsyncStorage.getItem(LANG_KEY);
    next = isLanguage(stored) ? stored : deviceLanguage();
  } catch {
    next = deviceLanguage();
  }
  if (next !== lang) {
    lang = next;
    listeners.forEach((l) => l(lang));
  }
  return lang;
}

export async function setLanguage(next: string): Promise<void> {
  if (!isLanguage(next) || next === lang) return;
  lang = next;
  listeners.forEach((l) => l(lang));
  try {
    await AsyncStorage.setItem(LANG_KEY, next);
  } catch {
    // The switch has already taken effect in memory; a failed write costs the
    // preference at next launch, not the language the user just chose.
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Re-renders the calling component whenever the language changes. Any screen
 * that renders `t()` output needs this — without it the strings are captured at
 * mount and the screen lies until it is navigated away from and back.
 */
export function useLanguage(): Language {
  const [current, setCurrent] = useState<Language>(lang);
  useEffect(() => subscribe(setCurrent), []);
  return current;
}

/** `useLanguage` plus a `t` bound to it, for the common case. */
export function useT(): { t: typeof translate; language: Language } {
  const language = useLanguage();
  const bound = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(key, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language],
  );
  return { t: bound, language };
}

/**
 * `{name}` placeholders are replaced from `params`. A placeholder with no
 * matching param is left as written rather than printed as "undefined", so a
 * missing value is visible in review instead of shipping as a hole in a
 * sentence.
 */
export function translate(key: string, params?: Record<string, string | number>): string {
  const raw = strings[lang]?.[key] ?? strings.en?.[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole,
  );
}

export const t = translate;

/** BCP-47 tag for Intl / toLocaleDateString. */
export function locale(): string {
  return lang === 'de' ? 'de-DE' : 'en-GB';
}

/**
 * English and German both take the "one vs other" rule, so a two-form helper is
 * honest here; it is deliberately not a general plural engine.
 */
export function plural(count: number, oneKey: string, otherKey: string, params?: Record<string, string | number>): string {
  return translate(count === 1 ? oneKey : otherKey, { count, ...params });
}
