import { LOCALES, type Locale } from './messages';

export const LOCALE_STORAGE_KEY = 'rayito.locale';
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

/** Reads the locale the visitor picked on a previous visit, if any. */
export function storedLocale(): Locale | null {
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    // Private modes and blocked storage fall back to browser detection.
    return null;
  }
}

export function persistLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Losing the preference is preferable to breaking the language switch.
  }
}

/** Matches the browser languages against the locales the wallet ships. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.trim().toLowerCase();
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

export function initialLocale(): Locale {
  return storedLocale() ?? detectLocale(browserLanguages());
}
