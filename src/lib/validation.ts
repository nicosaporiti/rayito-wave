export function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Usá al menos 10 caracteres.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Combiná letras y números.';
  return null;
}

export function normalizeMnemonic(value: string): readonly string[] {
  return value.trim().toLowerCase().split(/\s+/).filter(Boolean);
}
