import AsyncStorage from '@react-native-async-storage/async-storage';
import { en } from './en';
import { de } from './de';

const LANG_KEY = 'language';
const strings: Record<string, Record<string, string>> = { en, de };

let lang: string = 'en';

export async function getLanguage(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(LANG_KEY);
    lang = stored ?? 'en';
    return lang;
  } catch {
    return 'en';
  }
}

export async function setLanguage(l: string): Promise<void> {
  lang = l;
  await AsyncStorage.setItem(LANG_KEY, l);
}

export function t(key: string): string {
  return strings[lang]?.[key] ?? strings['en']?.[key] ?? key;
}
