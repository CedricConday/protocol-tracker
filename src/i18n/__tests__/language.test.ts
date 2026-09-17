/**
 * Which language the app comes up in.
 *
 * `lang` defaulted to 'en' with no device check at all, so a German phone came
 * up in English and stayed there unless its owner found the switch in Settings.
 * What is pinned here is the tag matching — the shapes a real device hands over
 * (`de`, `de-DE`, `de_AT`) all have to resolve to German, and nothing else may.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-native', () => ({
  NativeModules: {},
  Platform: { OS: 'android' },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { deviceLanguage, getLanguage, setLanguage, getCurrentLanguage } from '../index';

const asTag = (tag: string) => {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ locale: tag }),
  } as unknown as Intl.DateTimeFormat);
};

beforeEach(() => {
  vi.restoreAllMocks();
  (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockReset();
  (AsyncStorage.setItem as ReturnType<typeof vi.fn>).mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('en');
  await getLanguage();
});

describe('deviceLanguage', () => {
  it('takes every shape a device writes German as', () => {
    for (const tag of ['de', 'de-DE', 'de_AT', 'DE-ch']) {
      asTag(tag);
      expect(deviceLanguage(), tag).toBe('de');
    }
  });

  it('does not match a language that merely starts with the same letters', () => {
    // A real tag this app has no strings for. `de` must be the whole subtag.
    for (const tag of ['den', 'deu', 'en-GB', 'nl-NL']) {
      asTag(tag);
      expect(deviceLanguage(), tag).toBe('en');
    }
  });

  it('falls back to English when the platform tells it nothing', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl in this build');
    });
    expect(deviceLanguage()).toBe('en');
  });
});

describe('getLanguage', () => {
  it('uses the phone when there is no stored preference', async () => {
    asTag('de-DE');
    (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await getLanguage()).toBe('de');
  });

  it('does not write the device fallback back to storage', async () => {
    asTag('de-DE');
    (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await getLanguage();
    // Only setLanguage persists, so "what the phone says" and "what the user
    // asked for" stay distinguishable on the next launch.
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('lets an explicit choice beat the phone', async () => {
    asTag('de-DE');
    (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('en');
    expect(await getLanguage()).toBe('en');
  });

  it('ignores a stored value that is not a language this app has', async () => {
    asTag('de-DE');
    (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('fr');
    expect(await getLanguage()).toBe('de');
  });

  it('survives storage throwing', async () => {
    asTag('de-DE');
    (AsyncStorage.getItem as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no disk'));
    expect(await getLanguage()).toBe('de');
  });
});

describe('setLanguage', () => {
  it('persists the choice and takes effect immediately', async () => {
    await setLanguage('de');
    expect(getCurrentLanguage()).toBe('de');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('language', 'de');
  });

  it('ignores a language the app has no table for', async () => {
    await setLanguage('en');
    (AsyncStorage.setItem as ReturnType<typeof vi.fn>).mockClear();
    await setLanguage('fr');
    expect(getCurrentLanguage()).toBe('en');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
