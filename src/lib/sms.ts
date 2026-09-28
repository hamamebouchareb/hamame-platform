// Outbound SMS via the Twilio Messages API (no SDK dependency — plain fetch,
// same precedent as src/lib/email.ts using plain fetch instead of the Resend SDK).
//
// Env:
//   SMS_PROVIDER — set to "twilio" to actually send. Anything else (or unset)
//     means disabled: the caller keeps working and the raw token stays available
//     via the server log + the non-production response body, same as email.
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN — required when SMS_PROVIDER=twilio.
//   TWILIO_FROM — the Twilio sender number (E.164, e.g. "+12025550134").
//   FRONTEND_URL — base URL of the web app, used to build the /verify?token= and
//     /reset-password?token= links (shared with email.ts).
//
// Warn-only policy: sending is best-effort. This module never throws — failures
// return false and log a warning so auth flows can never hard-fail on SMS.
//
// Why links, not OTP codes: verification/reset already run on single-use
// high-entropy tokens consumed by POST /api/auth/verify (and the /verify page
// auto-submits ?token= links). Sending the same link by SMS keeps one token
// system instead of two, and tapping a link beats typing a code. The SMS
// verification path therefore marks phoneVerifiedAt through the exact same
// verify handler email uses.

export interface VerificationSmsInput {
  to: string;
  token: string;
}

export interface PasswordResetSmsInput {
  to: string;
  token: string;
}

export function buildSmsVerificationLink(token: string): string {
  const base = (process.env.FRONTEND_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  return `${base}/verify?token=${encodeURIComponent(token)}`;
}

export function buildSmsPasswordResetLink(token: string): string {
  const base = (process.env.FRONTEND_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

// Algerian numbers are commonly typed locally ("0550123456") but Twilio needs
// E.164 ("+213550123456"). Normalize the common local shapes; anything else
// passes through untouched (Twilio rejects it, warn-only absorbs it).
export function normalizePhoneNumber(raw: string): string {
  const digits = raw.replace(/[\s.\-()]/g, "");
  if (/^0[567]\d{8}$/.test(digits)) {
    return `+213${digits.slice(1)}`;
  }
  if (/^213[567]\d{8}$/.test(digits)) {
    return `+${digits}`;
  }
  return raw;
}

async function sendViaTwilio(to: string, kind: string, body: string): Promise<boolean> {
  if (process.env.SMS_PROVIDER !== "twilio") {
    console.log(`[sms] SMS_PROVIDER is not "twilio" — skipping ${kind} SMS to ${to}`);
    return false;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!accountSid || !authToken || !from) {
    console.warn(
      `[sms] SMS_PROVIDER=twilio but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM is missing — skipping ${kind} SMS to ${to}`
    );
    return false;
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: normalizePhoneNumber(to),
          From: from,
          Body: body,
        }).toString(),
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[sms] Twilio rejected ${kind} SMS to ${to}: ${response.status} ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[sms] Failed to send ${kind} SMS to ${to}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function sendVerificationSms(input: VerificationSmsInput): Promise<boolean> {
  const link = buildSmsVerificationLink(input.token);
  return sendViaTwilio(
    input.to,
    "verification",
    `Hamame : confirmez votre numéro en cliquant sur ce lien (valable 24 heures) : ${link}`
  );
}

export async function sendPasswordResetSms(input: PasswordResetSmsInput): Promise<boolean> {
  const link = buildSmsPasswordResetLink(input.token);
  return sendViaTwilio(
    input.to,
    "password-reset",
    `Hamame : réinitialisez votre mot de passe via ce lien (valable 1 heure) : ${link}`
  );
}
