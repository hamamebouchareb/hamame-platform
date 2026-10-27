// Shared DM types + attachment rules — the single contract used by the
// MessengerDock (docked windows) and the full messages page, so neither can
// drift from the other (previously both files hand-rolled ConversationSummary).

export interface ConversationSummary {
  id: string;
  otherUser: { id: string; fullName: string | null; online?: boolean };
  lastMessage: { body: string; fromMe: boolean; createdAt: string } | null;
  unreadCount: number;
  lastMessageAt: string;
}

export interface DirectMessageItem {
  id: string;
  senderId: string;
  body: string;
  readAt?: string | null;
  createdAt: string;
}

/** One attachment staged in the composer (already converted to a data URL). */
export interface DmAttachment {
  id: string;
  kind: "image" | "file";
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
}

// Mirrors the server-side trust boundary (src/lib/dm-attachments.ts). The
// frontend copy exists only for pre-flight UX feedback — the API re-validates
// everything and remains the real gate.
export const DM_MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
export const DM_MAX_FILE_BYTES = 4 * 1024 * 1024;
/** Cap per send batch, to bound sequential POSTs. */
export const DM_MAX_ATTACHMENTS_PER_SEND = 4;

export const DM_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif";
export const DM_FILE_ACCEPT = "application/pdf,text/plain,text/csv,.pdf,.txt,.csv";

/** Returns false when the file's declared mime/extension is outside the
 * allowlist (the picker's accept attribute is only a hint, not an enforcement). */
export function isDmAttachmentAllowed(kind: DmAttachment["kind"], mime: string, name: string): boolean {
  const lowerName = name.toLowerCase();
  if (kind === "image") {
    return (
      ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime) &&
      /\.(png|jpe?g|webp|gif)$/.test(lowerName)
    );
  }
  return (
    ["application/pdf", "text/plain", "text/csv"].includes(mime) &&
    /\.(pdf|txt|csv)$/.test(lowerName)
  );
}

/**
 * Human-readable size. Locale-neutral because FR and EN both use the short
 * o/ko/Mo units here; the decimal comma is the documented FR convention.
 */
export function formatDmBytes(size: number): string {
  if (size < 1024) return `${size} o`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0).replace(".", ",")} ko`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace(".", ",")} Mo`;
}
