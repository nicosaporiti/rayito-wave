import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createFormatters } from '../lib/format';
import { I18nContext, type I18nValue, type MessageParams } from './context';
import { interpolate } from './interpolate';
import { initialLocale, persistLocale } from './locale';
import { messages, type Locale, type MessageKey } from './messages';

type I18nProviderProps = {
  readonly children: ReactNode;
  /** Overrides browser detection; used by tests to pin a language. */
  readonly locale?: Locale;
};

export function I18nProvider({ children, locale: forcedLocale }: I18nProviderProps) {
  const [detectedLocale, setDetectedLocale] = useState<Locale>(initialLocale);
  const locale = forcedLocale ?? detectedLocale;

  const setLocale = useCallback((nextLocale: Locale): void => {
    setDetectedLocale(nextLocale);
    persistLocale(nextLocale);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dictionary = messages[locale];
    const formatters = createFormatters(locale);
    const t = (key: MessageKey, params?: MessageParams): string => (
      interpolate(dictionary[key], params)
    );

    return {
      locale,
      setLocale,
      t,
      plural: (key, count, params) => t(
        `${key}.${count === 1 ? 'one' : 'other'}` as MessageKey,
        { count: formatters.formatSats(count), ...params },
      ),
      resolve: (message) => ('text' in message ? message.text : t(message.key, message.params)),
      formatSats: formatters.formatSats,
      formatDate: (isoDate) => formatters.formatDate(isoDate) ?? t('date.now'),
      formatFullDate: (isoDate) => formatters.formatFullDate(isoDate) ?? t('date.unavailable'),
    };
  }, [locale, setLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = value.t('document.title');
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.setAttribute('content', value.t('document.description'));
  }, [locale, value]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
