import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { en } from './en';
import { de } from './de';

/**
 * Translation.
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
 *    key with named placeholders: t('waterNudge', { name, ml, goal }).
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

export async function getLanguage(): Promise<Language> {
  try {
    const stored = await AsyncStorage.getItem(LANG_KEY);
    if (isLanguage(stored) && stored !== lang) {
      lang = stored;
      listeners.forEach((l) => l(lang));
    }
    return lang;
  } catch {
    return lang;
  }
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
