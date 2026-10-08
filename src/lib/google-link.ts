// Google account-linking guard: when an existing password account is linked
// by verified email, a password set BEFORE the email was proven must stop
// working (it may belong to whoever typed the address first — typo or
// attacker-registered — not to the Google-verified owner). Pure decision:
// rotate exactly when the stored email was never verified.
export function shouldRotatePasswordOnGoogleLink(
  emailVerifiedAt: Date | null | undefined
): boolean {
  return emailVerifiedAt === null || emailVerifiedAt === undefined;
}
