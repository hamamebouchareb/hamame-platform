// CCP / BaridiMob receipt photos in a PRIVATE Supabase Storage bucket, over the
// Storage REST API with plain fetch (no supabase-js — zero-dependency
// precedent). Receipts are never public: the DB stores only the object path,
// and admins view them through short-lived signed URLs.
//
// Warn-only: with SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset,
// isReceiptStorageConfigured() is false and the upload endpoint returns 503.
// The service-role key bypasses RLS — it must only ever live server-side.

const BUCKET = process.env.WALLET_RECEIPTS_BUCKET?.trim() || "wallet-receipts";
const SIGNED_URL_SECONDS = 600;
const TIMEOUT_MS = 20000;

export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReceiptMime = (typeof RECEIPT_MIME_TYPES)[number];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

function config(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function isReceiptStorageConfigured(): boolean {
  return config() !== null;
}

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

let bucketReady = false;

// Idempotent: Supabase answers 400/409 "already exists" on a second create.
async function ensureBucket(url: string, key: string): Promise<void> {
  if (bucketReady) return;
  const response = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: headers(key, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: RECEIPT_MAX_BYTES,
      allowed_mime_types: [...RECEIPT_MIME_TYPES],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (!/already exists|Duplicate/i.test(text)) {
      throw new Error(`Supabase bucket create failed with HTTP ${response.status}`);
    }
  }
  bucketReady = true;
}

export async function uploadReceipt(path: string, bytes: Buffer, mime: ReceiptMime): Promise<void> {
  const cfg = config();
  if (!cfg) throw new Error("Receipt storage is not configured");
  await ensureBucket(cfg.url, cfg.key);
  const response = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers(cfg.key, { "Content-Type": mime, "x-upsert": "false" }),
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Supabase receipt upload failed with HTTP ${response.status}`);
  }
}

export async function signedReceiptUrl(path: string): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;
  const response = await fetch(`${cfg.url}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers(cfg.key, { "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { signedURL?: string } | null;
  return body?.signedURL ? `${cfg.url}/storage/v1${body.signedURL}` : null;
}

// Magic-byte sniff so a renamed non-image can't be stored as a "receipt".
export function sniffReceiptMime(bytes: Buffer): ReceiptMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}
