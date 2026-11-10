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
  | {
      kind: "question";
      id: string;
      unitId: string;
      title: string;
      note?: string;
      /** Rich preview (shares sent after 2026-11-10); older shares carry only `title`. */
      text?: string;
      options?: string[];
      module?: string;
      unit?: string;
      sitting?: string;
    }
  | { kind: "resource"; id: string; title: string; note?: string }
  | { kind: "image"; url: string; name?: string; note?: string }
  | { kind: "file"; name: string; mime: string; size: number; url: string; note?: string };

export function parseShare(body: string): SharedPayload | null {
  if (!body.startsWith(SHARE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(SHARE_PREFIX.length)) as Record<string, unknown>;
    const str = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : undefined);
    const note = str(parsed.note);
    if (parsed.kind === "question" && str(parsed.id) && str(parsed.unitId)) {
      return {
        kind: "question",
        id: parsed.id as string,
        unitId: parsed.unitId as string,
        title: str(parsed.title) ?? "",
        note,
        text: str(parsed.text),
        options: Array.isArray(parsed.options)
          ? parsed.options.filter((option): option is string => typeof option === "string")
          : undefined,
        module: str(parsed.module),
        unit: str(parsed.unit),
        sitting: str(parsed.sitting),
      };
    }
    if (parsed.kind === "resource" && str(parsed.id) && str(parsed.title)) {
      return { kind: "resource", id: parsed.id as string, title: parsed.title as string, note };
    }
    const url = str(parsed.url);
    if (parsed.kind === "image" && url) {
      if (url.startsWith("https://") || isInlineImage(url)) {
        return { kind: "image", url, name: str(parsed.name), note };
      }
      return null;
    }
    if (parsed.kind === "file" && str(parsed.name) && url) {
      if (url.startsWith("https://") || url.includes(";base64,")) {
        return {
          kind: "file",
          name: parsed.name as string,
          mime: str(parsed.mime) ?? "application/octet-stream",
          size: typeof parsed.size === "number" ? parsed.size : 0,
          url,
          note,
        };
      }
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export function isQuestionShare(body: string): boolean {
  return parseShare(body)?.kind === "question";
}

export function shareLabel(body: string): string | null {
  const share = parseShare(body);
  if (!share) return null;
  if (share.kind === "file") return share.name;
  if (share.kind === "image") return share.note || "Photo";
  return share.title || share.note || null;
}
