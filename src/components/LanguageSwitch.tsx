import type { ReactElement } from 'react';
import { useI18n } from '../i18n/useI18n';
import { LOCALES, type Locale } from '../i18n/messages';
import { Button } from './ui/button';

const OPTION_LABEL = {
  es: 'locale.es',
  en: 'locale.en',
} as const satisfies Record<Locale, 'locale.es' | 'locale.en'>;

export function LanguageSwitch(): ReactElement {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="locale-switch" role="group" aria-label={t('locale.label')}>
      {LOCALES.map((option) => (
        <Button
          key={option}
          className="locale-switch__option"
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={locale === option}
          onClick={() => setLocale(option)}
        >
          {/* The tag keeps the header compact; the accessible name is the
              language's own endonym, so it reads the same in either locale. */}
          <span aria-hidden="true">{option}</span>
          <span className="sr-only">{t(OPTION_LABEL[option])}</span>
        </Button>
      ))}
    </div>
  );
}
