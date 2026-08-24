import webpush from "web-push";

// Mirrors src/lib/ai/anthropic.ts's isAiConfigured() pattern: read env lazily so
// importing this module never crashes a process that has no VAPID keys configured yet
// (fresh clone, CI, a dev box that hasn't generated a keypair) — the API boots fine
// without one, and every push send degrades to a logged no-op (see src/lib/push/send.ts).
let configured: boolean | null = null;

export function isPushConfigured(): boolean {
  if (configured !== null) {
    return configured;
  }
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  configured = Boolean(publicKey && privateKey && subject);
  if (configured) {
    webpush.setVapidDetails(subject!, publicKey!, privateKey!);
  }
  return configured;
}

export { webpush };
