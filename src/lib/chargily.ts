// Chargily Pay V2 (CIB / Edahabia) — plain fetch, no SDK (same zero-dependency
// precedent as email.ts / sms.ts / oauth-google.ts).
//
// Warn-only like every optional integration: with CHARGILY_SECRET_KEY unset,
// isChargilyConfigured() is false, the wallet reports online payment as
// unavailable and the checkout/webhook endpoints fail closed with 503.
//
// Docs: https://dev.chargily.com/pay-v2/api-reference/checkouts/create
//       https://dev.chargily.com/pay-v2/webhooks
import { createHmac, timingSafeEqual } from "crypto";

const TEST_BASE = "https://pay.chargily.net/test/api/v2";
const LIVE_BASE = "https://pay.chargily.net/api/v2";
const TIMEOUT_MS = 15000;

export type ChargilyCheckoutStatus = "pending" | "processing" | "paid" | "failed" | "canceled" | "expired";

export interface ChargilyCheckout {
  id: string;
  status: ChargilyCheckoutStatus;
  amount: number;
  checkout_url?: string;
  metadata?: Record<string, unknown> | null;
}

function secretKey(): string | null {
  const key = process.env.CHARGILY_SECRET_KEY?.trim();
  return key ? key : null;
}

function baseUrl(): string {
  return process.env.CHARGILY_MODE === "live" ? LIVE_BASE : TEST_BASE;
}

export function isChargilyConfigured(): boolean {
  return secretKey() !== null;
}

let warned = false;
export function warnIfChargilyMissing(): void {
  if (!isChargilyConfigured() && !warned) {
    warned = true;
    console.warn("[chargily] CHARGILY_SECRET_KEY is not set — online wallet top-ups are disabled.");
  }
}

async function chargilyRequest<T>(path: string, init: RequestInit): Promise<T> {
  const key = secretKey();
  if (!key) throw new Error("Chargily is not configured");
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !body) {
    throw new Error(`Chargily ${init.method ?? "GET"} ${path} failed with HTTP ${response.status}`);
  }
  return body;
}

export async function createChargilyCheckout(args: {
  amountDzd: number;
  successUrl: string;
  failureUrl: string;
  webhookUrl: string | null;
  locale: "fr" | "en";
  description: string;
  orderId: string;
}): Promise<ChargilyCheckout> {
  return chargilyRequest<ChargilyCheckout>("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amountDzd,
      currency: "dzd",
      success_url: args.successUrl,
      failure_url: args.failureUrl,
      ...(args.webhookUrl ? { webhook_endpoint: args.webhookUrl } : {}),
      locale: args.locale,
      description: args.description,
      metadata: { order_id: args.orderId },
    }),
  });
}

export async function getChargilyCheckout(checkoutId: string): Promise<ChargilyCheckout> {
  return chargilyRequest<ChargilyCheckout>(`/checkouts/${encodeURIComponent(checkoutId)}`, { method: "GET" });
}

// The signature is a hex HMAC-SHA256 of the exact raw request body, keyed with
// the API secret key — so it must be checked against the raw bytes, never a
// re-serialized JSON.parse result.
export function verifyChargilySignature(rawBody: Buffer, signature: string | undefined): boolean {
  const key = secretKey();
  if (!key || !signature) return false;
  const expected = createHmac("sha256", key).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
