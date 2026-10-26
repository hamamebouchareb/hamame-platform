export const SHARE_PREFIX = "[[hamame]]";

export type SharedPayload =
  | { kind: "question"; id: string; unitId: string; title: string; note?: string }
  | { kind: "resource"; id: string; title: string; note?: string }
  | { kind: "image"; url: string; note?: string };

export function parseShare(body: string): SharedPayload | null {
  if (!body.startsWith(SHARE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(SHARE_PREFIX.length)) as Partial<SharedPayload> & { kind?: string };
    if (parsed.kind === "question" && parsed.id && parsed.unitId) {
      return { kind: "question", id: parsed.id, unitId: parsed.unitId, title: parsed.title ?? "", note: parsed.note };
    }
    if (parsed.kind === "resource" && parsed.id && parsed.title) {
      return { kind: "resource", id: parsed.id, title: parsed.title, note: parsed.note };
    }
    if (parsed.kind === "image" && typeof parsed.url === "string" && parsed.url.startsWith("https://")) {
      return { kind: "image", url: parsed.url, note: parsed.note };
    }
    return null;
  } catch {
    return null;
  }
}

export function shareLabel(body: string): string | null {
  const share = parseShare(body);
  if (!share) return null;
  if (share.kind === "image") return share.note || "Photo";
  return share.title || share.note || null;
}
