import { describe, expect, it } from 'vitest';
import {
  MAX_BITCOIN_AMOUNT_SAT,
  normalizeMnemonic,
  parseSatoshiAmount,
  validatePassword,
} from './validation';

describe('validatePassword', () => {
  it('requires ten characters with letters and numbers', () => {
    expect(validatePassword('corta1')).toBe('Usá al menos 10 caracteres.');
    expect(validatePassword('solamentelarga')).toBe('Combiná letras y números.');
    expect(validatePassword('segura2026')).toBeNull();
  });
});

describe('normalizeMnemonic', () => {
  it('normalizes case and arbitrary whitespace', () => {
    expect(normalizeMnemonic('  UNO  dos\nTRES ')).toEqual(['uno', 'dos', 'tres']);
  });
});

describe('parseSatoshiAmount', () => {
  it('accepts positive integer satoshi amounts up to the Bitcoin limit', () => {
    expect(parseSatoshiAmount('1')).toEqual({ valid: true, amountSat: 1 });
    expect(parseSatoshiAmount(String(MAX_BITCOIN_AMOUNT_SAT))).toEqual({
      valid: true,
      amountSat: MAX_BITCOIN_AMOUNT_SAT,
    });
  });

  it('rejects empty, non-integer, unsafe, and out-of-range values', () => {
    expect(parseSatoshiAmount('')).toMatchObject({ valid: false });
    expect(parseSatoshiAmount('0')).toMatchObject({ valid: false });
    expect(parseSatoshiAmount('-1')).toMatchObject({ valid: false });
    expect(parseSatoshiAmount('1.5')).toMatchObject({ valid: false });
    expect(parseSatoshiAmount('9007199254740993')).toMatchObject({ valid: false });
    expect(parseSatoshiAmount(`${MAX_BITCOIN_AMOUNT_SAT}0`)).toMatchObject({ valid: false });
  });
});
