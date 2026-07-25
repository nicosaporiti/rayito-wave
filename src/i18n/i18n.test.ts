import { describe, expect, it } from 'vitest';
import { interpolate } from './interpolate';
import { detectLocale, isLocale } from './locale';
import { LOCALES, messages } from './messages';

describe('message catalogues', () => {
  it('keeps every locale in sync with the same keys', () => {
    const spanishKeys = Object.keys(messages.es).sort();

    for (const locale of LOCALES) {
      expect(Object.keys(messages[locale]).sort(), locale).toEqual(spanishKeys);
    }
  });

  it('leaves no message empty and no placeholder untranslated across locales', () => {
    const placeholders = (value: string): readonly string[] => (
      (value.match(/\{\w+\}/g) ?? []).slice().sort()
    );

    for (const [key, spanish] of Object.entries(messages.es)) {
      for (const locale of LOCALES) {
        const translation = messages[locale][key as keyof typeof messages.es];
        expect(translation.trim(), `${locale}:${key}`).not.toBe('');
        expect(placeholders(translation), `${locale}:${key}`).toEqual(placeholders(spanish));
      }
    }
  });

  it('pairs every countable message with both plural variants', () => {
    for (const key of Object.keys(messages.es)) {
      if (!key.endsWith('.one')) continue;
      expect(messages.es).toHaveProperty(`${key.slice(0, -4)}.other`);
    }
  });
});

describe('interpolate', () => {
  it('replaces known placeholders and keeps unknown ones verbatim', () => {
    expect(interpolate('Esperando {sats} sats', { sats: '2.100' })).toBe('Esperando 2.100 sats');
    expect(interpolate('{a} y {b}', { a: 1 })).toBe('1 y {b}');
    expect(interpolate('Sin datos')).toBe('Sin datos');
  });
});

describe('detectLocale', () => {
  it('matches the first supported browser language', () => {
    expect(detectLocale(['es-AR', 'en-US'])).toBe('es');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale(['pt-BR', 'es-MX'])).toBe('es');
  });

  it('falls back to English when nothing matches', () => {
    expect(detectLocale(['pt-BR', 'fr'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('recognises only the shipped locales', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('pt')).toBe(false);
  });
});
