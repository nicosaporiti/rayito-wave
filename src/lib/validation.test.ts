import { describe, expect, it } from 'vitest';
import { normalizeMnemonic, validatePassword } from './validation';

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
