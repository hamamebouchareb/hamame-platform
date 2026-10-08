// Canonical email form: trim surrounding whitespace, lowercase everything.
// Applied in Zod BEFORE .email() on every client-supplied address so
// "  ALICE@Example.DZ " and "alice@example.dz" are the same account at
// validation, lookup, and storage time. Phone numbers are deliberately
// untouched.
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
