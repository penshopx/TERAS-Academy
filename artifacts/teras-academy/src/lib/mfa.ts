/** TOTP challenges are six decimal digits; reject partial or pasted non-numeric values before calling Supabase. */
export function isValidTotpCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/** Keeps the UI state suitable for an OTP input without retaining any secret material. */
export function normalizeTotpCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}