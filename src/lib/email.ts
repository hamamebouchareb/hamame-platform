// Outbound email via the Resend HTTP API (no SDK dependency — plain fetch).
//
// Env:
//   RESEND_API_KEY — required to actually send. When unset, sending is skipped
//     (dev fallback): the caller keeps working and the raw token stays available
//     via the server log + the non-production response body, same as before.
//   EMAIL_FROM — sender identity, e.g. "Hamame <no-reply@hamame.dz>". Must be a
//     verified sender/domain in Resend. Defaults to "Hamame <no-reply@hamame.dz>".
//   FRONTEND_URL — base URL of the web app, used to build the verification link
//     (e.g. "https://hamame-platform-wcpk.vercel.app"). Defaults to the local
//     frontend dev server so local setups work with zero config.
//
// Warn-only policy: sending is best-effort. This module never throws — failures
// return false and log a warning so registration can never hard-fail on email.

const RESEND_API_URL = "https://api.resend.com/emails";

export interface VerificationEmailInput {
  to: string;
  token: string;
  fullName: string | null;
}

export function buildVerificationLink(token: string): string {
  const base = (process.env.FRONTEND_URL ?? "http://localhost:3001").replace(/\/+$/, "");
  return `${base}/verify?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(input: VerificationEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY not set — skipping verification email to ${input.to}`);
    return false;
  }

  const from = process.env.EMAIL_FROM ?? "Hamame <no-reply@hamame.dz>";
  const link = buildVerificationLink(input.token);
  const greeting = input.fullName ? `Bonjour ${input.fullName},` : "Bonjour,";
  const subject = "Vérifiez votre adresse email — Hamame";

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject,
        text: `${greeting}\n\nMerci de vous être inscrit sur Hamame. Confirmez votre adresse email en cliquant sur ce lien (valable 24 heures) :\n\n${link}\n\nSi vous n'avez pas créé ce compte, ignorez simplement cet email.`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[email] Resend rejected verification email to ${input.to}: ${response.status} ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[email] Failed to send verification email to ${input.to}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
