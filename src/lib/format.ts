import type {
  EntryFailureCode,
  EntryKind,
  EntryPhase,
  EntryStatus,
} from '@lightninglabs/wavelength-react';
import type { Locale, MessageKey } from '../i18n/messages';

export type Formatters = {
  /** Groups an integer amount of satoshis for the active locale. */
  readonly formatSats: (value: number) => string;
  /** Returns `null` when the timestamp cannot be parsed. */
  readonly formatDate: (value: string) => string | null;
  /** Returns `null` when the timestamp cannot be parsed. */
  readonly formatFullDate: (value: string) => string | null;
};

/**
 * Number and date conventions are chosen per language rather than inherited
 * from the bare tag: plain `es` skips grouping below five digits, which would
 * print a 2100 sat balance without its thousands separator.
 */
const INTL_LOCALE = {
  es: 'es-AR',
  en: 'en-US',
} as const satisfies Record<Locale, string>;

export function createFormatters(locale: Locale): Formatters {
  const intlLocale = INTL_LOCALE[locale];
  const integerFormat = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });
  const dateFormat = new Intl.DateTimeFormat(intlLocale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const fullDateFormat = new Intl.DateTimeFormat(intlLocale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  });
  const formatWith = (
    format: Intl.DateTimeFormat,
    value: string,
  ): string | null => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : format.format(date);
  };

  return {
    formatSats: (value) => integerFormat.format(value),
    formatDate: (value) => formatWith(dateFormat, value),
    formatFullDate: (value) => formatWith(fullDateFormat, value),
  };
}

export const entryKindKey = (kind: EntryKind): MessageKey => {
  switch (kind) {
    case 'send': return 'entry.kind.send';
    case 'receive': return 'entry.kind.receive';
    case 'deposit': return 'entry.kind.deposit';
    case 'exit': return 'entry.kind.exit';
    default: return kind satisfies never;
  }
};

export const entryPhaseKey = (phase: EntryPhase): MessageKey => {
  switch (phase) {
    case 'unspecified': return 'entry.phase.unspecified';
    case 'request_created': return 'entry.phase.request_created';
    case 'waiting_for_payment': return 'entry.phase.waiting_for_payment';
    case 'payment_detected': return 'entry.phase.payment_detected';
    case 'settling': return 'entry.phase.settling';
    case 'confirmed': return 'entry.phase.confirmed';
    case 'refunding': return 'entry.phase.refunding';
    case 'refunded': return 'entry.phase.refunded';
    case 'failed': return 'entry.phase.failed';
    case 'waiting_for_confirmation': return 'entry.phase.waiting_for_confirmation';
    default: return phase satisfies never;
  }
};

export const entryFailureKey = (code: EntryFailureCode): MessageKey => {
  switch (code) {
    case 'timed_out': return 'entry.failure.timed_out';
    case 'expired': return 'entry.failure.expired';
    case 'refunded': return 'entry.failure.refunded';
    case 'needs_intervention': return 'entry.failure.needs_intervention';
    case 'failed': return 'entry.failure.failed';
    default: return code satisfies never;
  }
};

export const entryStatusKey = (status: EntryStatus): MessageKey => {
  switch (status) {
    case 'pending': return 'entry.status.pending';
    case 'complete': return 'entry.status.complete';
    case 'failed': return 'entry.status.failed';
    default: return status satisfies never;
  }
};
