export const SHARE_PREFIX = "[[hamame]]";

// Data-URL image attachments (messenger polish, 2026-10-27) ride the same
// "image" payload kind as https photos; the allowlist mirrors
// src/lib/dm-attachments.ts, this copy is display-only.
const INLINE_IMAGE_PREFIXES = [
  "data:image/png;base64,",
  "data:image/jpeg;base64,",
  "data:image/webp;base64,",
  "data:image/gif;base64,",
] as const;

function isInlineImage(url: string): boolean {
  return INLINE_IMAGE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export type SharedPayload =
  | { kind: "question"; id: string; unitId: string; title: string; note?: string }
  | { kind: "resource"; id: string; title: string; note?: string }
  | { kind: "image"; url: string; name?: string; note?: string }
  | { kind: "file"; name: string; mime: string; size: number; url: string; note?: string };

export function parseShare(body: string): SharedPayload | null {
  if (!body.startsWith(SHARE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(SHARE_PREFIX.length)) as Partial<SharedPayload> & { kind?: string; url?: string };
    if (parsed.kind === "question" && parsed.id && parsed.unitId) {
      return { kind: "question", id: parsed.id, unitId: parsed.unitId, title: parsed.title ?? "", note: parsed.note };
    }
    if (parsed.kind === "resource" && parsed.id && parsed.title) {
      return { kind: "resource", id: parsed.id, title: parsed.title, note: parsed.note };
    }
    if (parsed.kind === "image" && typeof parsed.url === "string") {
      if (parsed.url.startsWith("https://") || isInlineImage(parsed.url)) {
        return {
          kind: "image",
          url: parsed.url,
          name: typeof parsed.name === "string" ? parsed.name : undefined,
          note: parsed.note,
        };
      }
      return null;
    }
    if (parsed.kind === "file" && typeof parsed.name === "string" && typeof parsed.url === "string") {
      if (parsed.url.startsWith("https://") || parsed.url.includes(";base64,")) {
        return {
          kind: "file",
          name: parsed.name,
          mime: typeof parsed.mime === "string" ? parsed.mime : "application/octet-stream",
          size: typeof parsed.size === "number" ? parsed.size : 0,
          url: parsed.url,
          note: parsed.note,
        };
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export function shareLabel(body: string): string | null {
  const share = parseShare(body);
  if (!share) return null;
  if (share.kind === "file") return share.name;
  if (share.kind === "image") return share.note || "Photo";
  return share.title || share.note || null;
}
