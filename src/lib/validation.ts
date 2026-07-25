import type { MessageKey } from '../i18n/messages';

export function validatePassword(password: string): MessageKey | null {
  if (password.length < 10) return 'validation.password.tooShort';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'validation.password.needsMix';
  return null;
}

export function normalizeMnemonic(value: string): readonly string[] {
  return value.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export const MAX_BITCOIN_AMOUNT_SAT = 2_100_000_000_000_000;

export type SatoshiAmountResult =
  | { readonly valid: true; readonly amountSat: number }
  | { readonly valid: false; readonly error: MessageKey };

export function parseSatoshiAmount(value: string): SatoshiAmountResult {
  if (!/^[1-9]\d*$/.test(value)) {
    return { valid: false, error: 'validation.amount.notPositiveInteger' };
  }

  if (value.length > String(MAX_BITCOIN_AMOUNT_SAT).length) {
    return {
      valid: false,
      error: 'validation.amount.aboveMaximum',
    };
  }

  const amount = BigInt(value);
  if (amount > BigInt(MAX_BITCOIN_AMOUNT_SAT)) {
    return {
      valid: false,
      error: 'validation.amount.aboveMaximum',
    };
  }

  return { valid: true, amountSat: Number(amount) };
}
