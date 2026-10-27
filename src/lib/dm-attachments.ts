import { ApiError } from "./errors";

// DM attachments (2026-10-27, messenger polish session).
//
// There is NO object storage in this stack (Railway's filesystem is ephemeral,
// Supabase Storage is untracked). Rather than pretending an upload endpoint
// exists, attachments ride inside the existing `[[hamame]]` message-body
// convention as size-capped, MIME-allowlisted base64 data URLs — the exact
// shape DirectMessage.body already carries for question/resource/image shares.
// This module is the single server-side trust boundary; the frontend picker
// mirrors its rules only as UX guidance (never as the security check).
//
// Caps are deliberately conservative: polling endpoints ship bodies wholesale.

export const ATTACHMENT_IMAGE_KIND = "image" as const;
export const ATTACHMENT_FILE_KIND = "file" as const;
export type AttachmentKind = typeof ATTACHMENT_IMAGE_KIND | typeof ATTACHMENT_FILE_KIND;

const BYTES_PER_CHAR = 3 / 4; // base64 stores 3 bytes per 4 chars

export const ALLOWED_IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
// Documents: PDF is the medical-course staple; plain text/CSV keep it honest.
// Office formats (docx/xlsx/pptx) are ZIP archives with hard-to-verify magic
// bytes — deliberately refused until real storage exists.
export const ALLOWED_FILE_MIMES = ["application/pdf", "text/plain", "text/csv"] as const;

export const MAX_IMAGE_BYTES = Math.ceil(2.5 * 1024 * 1024);
export const MAX_FILE_BYTES = Math.ceil(4 * 1024 * 1024);

// Rounded ceiling on the dataUrl string: 4/3 overhead + prefix + slack.
export const MAX_IMAGE_CHARS = Math.ceil((MAX_IMAGE_BYTES / BYTES_PER_CHAR) * 1.01) + 512;
export const MAX_FILE_CHARS = Math.ceil((MAX_FILE_BYTES / BYTES_PER_CHAR) * 1.01) + 512;

export interface AttachmentSpec {
  kind: AttachmentKind;
  name: string;
  mime: string;
  dataUrl: string;
}

export interface ValidatedAttachment {
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
}

function isAllowlistedDataUrl(dataUrl: string, allowed: readonly string[]): boolean {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return false;
  const prefix = dataUrl.slice(0, comma + 1); // e.g. "data:image/png;base64,"
  return allowed.some((mime) => prefix === `data:${mime};base64,`);
}

/** Throws ApiError with the shared "attachment" vocabulary when the payload is
 * unusable. Returns the normalised attachment (declared size recomputed). */
export function validateAttachment(spec: AttachmentSpec): ValidatedAttachment {
  const allowed = spec.kind === ATTACHMENT_IMAGE_KIND ? ALLOWED_IMAGE_MIMES : ALLOWED_FILE_MIMES;
  const maxBytes = spec.kind === ATTACHMENT_IMAGE_KIND ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  const maxChars = spec.kind === ATTACHMENT_IMAGE_KIND ? MAX_IMAGE_CHARS : MAX_FILE_CHARS;

  if (
    spec.dataUrl.length > maxChars ||
    !isAllowlistedDataUrl(spec.dataUrl, allowed)
  ) {
    throw new ApiError(400, "ATTACHMENT_TYPE_UNSUPPORTED", "Type de pièce jointe non autorisé ou trop volumineux.");
  }
  if (spec.mime !== spec.dataUrl.slice(5, spec.dataUrl.indexOf(";"))) {
    // Declared mime must match the dataUrl's own prefix — an .png renamed .pdf
    // cannot slip through as a document.
    throw new ApiError(400, "ATTACHMENT_TYPE_UNSUPPORTED", "Type de pièce jointe non autorisé.");
  }

  const comma = spec.dataUrl.indexOf(",");
  const base64 = spec.dataUrl.slice(comma + 1);
  const size = Math.floor(base64.length / 4) * 3;
  if (size <= 0) {
    throw new ApiError(400, "ATTACHMENT_INVALID", "Pièce jointe vide ou illisible.");
  }
  if (size > maxBytes) {
    throw new ApiError(413, "ATTACHMENT_TOO_LARGE", "Pièce jointe trop volumineuse.");
  }

  const name = spec.name.replace(/[\r\n\t\0]/g, " ").trim().slice(0, 200);
  if (!name) {
    throw new ApiError(400, "ATTACHMENT_INVALID", "Pièce jointe incomplète.");
  }

  return { kind: spec.kind, name, mime: spec.mime, size, dataUrl: spec.dataUrl };
}
