export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Usá al menos 10 caracteres.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Combiná letras y números.';
  return null;
}

export function normalizeMnemonic(value: string): readonly string[] {
  return value.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export const MAX_BITCOIN_AMOUNT_SAT = 2_100_000_000_000_000;

export type SatoshiAmountResult =
  | { readonly valid: true; readonly amountSat: number }
  | { readonly valid: false; readonly error: string };

export function parseSatoshiAmount(value: string): SatoshiAmountResult {
  if (!/^[1-9]\d*$/.test(value)) {
    return { valid: false, error: 'Ingresá un monto entero mayor que cero.' };
  }

  if (value.length > String(MAX_BITCOIN_AMOUNT_SAT).length) {
    return {
      valid: false,
      error: 'El monto supera el máximo posible de Bitcoin.',
    };
  }

  const amount = BigInt(value);
  if (amount > BigInt(MAX_BITCOIN_AMOUNT_SAT)) {
    return {
      valid: false,
      error: 'El monto supera el máximo posible de Bitcoin.',
    };
  }

  return { valid: true, amountSat: Number(amount) };
}
