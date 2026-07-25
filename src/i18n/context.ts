import { createContext } from 'react';
import type { Locale, MessageKey, PluralKey } from './messages';

export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * A message held in component state. Storing the key instead of the rendered
 * string is what lets an already-visible error follow a language change; the
 * `text` variant carries verbatim copy from outside the catalogue, such as an
 * SDK error, which cannot be translated.
 */
export type PendingMessage =
  | { readonly key: MessageKey; readonly params?: MessageParams }
  | { readonly text: string };

export type I18nValue = {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  /** Translates a key, replacing every `{name}` placeholder with `params.name`. */
  readonly t: (key: MessageKey, params?: MessageParams) => string;
  /** Picks the `.one`/`.other` variant of `key` and injects `{count}`. */
  readonly plural: (key: PluralKey, count: number, params?: MessageParams) => string;
  /** Renders a state-held message at the current locale. */
  readonly resolve: (message: PendingMessage) => string;
  readonly formatSats: (value: number) => string;
  readonly formatDate: (value: string) => string;
  readonly formatFullDate: (value: string) => string;
};

export const I18nContext = createContext<I18nValue | null>(null);
