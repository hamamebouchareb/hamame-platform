"use client";

import { useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/Icon";
import {
  DM_FILE_ACCEPT,
  DM_IMAGE_ACCEPT,
  DM_MAX_ATTACHMENTS_PER_SEND,
  DM_MAX_FILE_BYTES,
  DM_MAX_IMAGE_BYTES,
  formatDmBytes,
  isDmAttachmentAllowed,
  type DmAttachment,
  type DirectMessageItem,
} from "@/lib/dm-types";

let localAttachmentSeq = 0;

/**
 * Shared message composer used by BOTH the docked Facebook-style chat windows
 * (MessengerDock) and the full messages page — one send path, one attachment
 * pipeline, no drifting copies.
 *
 * Attachment UX (Phase 5): native file pickers via properly associated
 * <input type="file"> triggered by visible buttons; cancelling the picker
 * changes nothing (change never fires); selections are re-removable; the input
 * value resets after every read so the same file can be picked again. Send
 * posts attachments one message each (server allows a single attachment per
 * message), then any trailing text — failures keep the still-unsent items.
 */
export function DmComposer({
  conversationId,
  className,
  onSent,
}: {
  conversationId: string;
  className?: string;
  onSent?: (message: DirectMessageItem) => void;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<DmAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function buildStaged(file: File, kind: DmAttachment["kind"]): Promise<DmAttachment> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("READ_FAILED"));
          return;
        }
        resolve({ id: `att-${Date.now()}-${localAttachmentSeq++}`, kind, name: file.name, mime: file.type, size: file.size, dataUrl: reader.result });
      };
      reader.onerror = () => reject(new Error("READ_FAILED"));
      reader.readAsDataURL(file);
    });
  }

  function clearInput(input: HTMLInputElement) {
    // Same file must be selectable again; cancelled pickers never reach here.
    input.value = "";
  }

  async function handleSelection(input: HTMLInputElement, kind: DmAttachment["kind"]) {
    setNotice(null);
    setSendError(null);
    const files = Array.from(input.files ?? []);
    clearInput(input);
    if (files.length === 0) return; // picker was cancelled — nothing changed
    const rejected: string[] = [];
    let overflowed = false;
    const accepted: DmAttachment[] = [];
    for (const file of files) {
      if (pending.length + accepted.length >= DM_MAX_ATTACHMENTS_PER_SEND) {
        overflowed = true;
        break;
      }
      const maxBytes = kind === "image" ? DM_MAX_IMAGE_BYTES : DM_MAX_FILE_BYTES;
      if (!isDmAttachmentAllowed(kind, file.type || "", file.name)) {
        rejected.push(file.name);
        continue;
      }
      if (file.size === 0 || file.size > maxBytes) {
        rejected.push(file.name);
        continue;
      }
      try {
        accepted.push(await buildStaged(file, kind));
      } catch {
        rejected.push(file.name);
      }
    }
    if (accepted.length > 0) setPending((prev) => [...prev, ...accepted]);
    if (rejected.length > 0) setNotice(t("dms.attachRejectedList", { names: rejected.slice(0, 3).join(", ") }));
    else if (overflowed) setNotice(t("dms.attachTooMany", { max: DM_MAX_ATTACHMENTS_PER_SEND }));
  }

  function removePending(id: string) {
    setPending((prev) => prev.filter((item) => item.id !== id));
    setNotice(null);
  }

  async function post(body: Record<string, unknown>) {
    const data = await apiFetch<{ message: DirectMessageItem }>(
      `/dms/conversations/${conversationId}/messages`,
      { method: "POST", body: JSON.stringify(body) }
    );
    onSent?.(data.message);
  }

  async function send() {
    if (sending) return; // duplicate-send guard
    if (pending.length === 0 && text.trim().length === 0) return;
    setSending(true);
    setSendError(null);
    const remaining: DmAttachment[] = [...pending];
    let failed = false;
    try {
      for (const attachment of remaining) {
        try {
          await post({
            attachment: { kind: attachment.kind, name: attachment.name, mime: attachment.mime, dataUrl: attachment.dataUrl },
            ...(text.trim() && attachment === pending[0] ? { body: text.trim() } : {}),
          });
          setPending((prev) => prev.filter((item) => item.id !== attachment.id));
        } catch {
          setSendError(t("dms.attachSendFailed", { name: attachment.name }));
          failed = true;
          break; // keep the rest staged; user retries
        }
      }
      if (!failed && text.trim().length > 0) {
        try {
          await post({ body: text.trim() });
          setText("");
        } catch {
          setSendError(t("dms.sendFailed"));
        }
      }
    } finally {
      setSending(false);
    }
  }

  const canSend = !sending && (pending.length > 0 || text.trim().length > 0);

  return (
    <div className={cx("flex flex-col gap-1.5 border-t border-border p-2", className)} data-dm-composer="">
      {notice ? (
        <p role="status" className="px-1 text-caption text-text-secondary">
          {notice}
        </p>
      ) : null}
      {sendError ? (
        <p role="alert" className="px-1 text-caption text-danger">
          {sendError}
        </p>
      ) : null}

      {pending.length > 0 ? (
        <ul className="flex flex-wrap gap-2 px-1" aria-label={t("dms.pendingAria")}>
          {pending.map((item) =>
            item.kind === "image" ? (
              <li key={item.id} className="group relative">
                <img src={item.dataUrl} alt={item.name} className="h-14 w-14 rounded-control border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => removePending(item.id)}
                  aria-label={t("dms.removeAttachment", { name: item.name })}
                  className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-pill bg-surface-1 text-text-secondary shadow-card hover:text-text-primary"
                >
                  <Icon name="close" size={10} />
                </button>
              </li>
            ) : (
              <li key={item.id}>
                <span className="flex max-w-[14rem] items-center gap-1.5 rounded-pill border border-border bg-surface-2 py-1 pl-2.5 pr-1 text-caption text-text-primary">
                  <Icon name="paperclip" size={12} className="shrink-0 text-text-secondary" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <span className="shrink-0 text-text-tertiary">{formatDmBytes(item.size)}</span>
                  <button
                    type="button"
                    onClick={() => removePending(item.id)}
                    aria-label={t("dms.removeAttachment", { name: item.name })}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill text-text-secondary hover:text-text-primary"
                  >
                    <Icon name="close" size={10} />
                  </button>
                </span>
              </li>
            )
          )}
        </ul>
      ) : null}

      <form
        className="flex items-end gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <button
          type="button"
          aria-label={t("dms.attachImage")}
          onClick={() => imageInputRef.current?.click()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          data-dm-attach-image=""
        >
          <Icon name="image" size={18} />
        </button>
        <button
          type="button"
          aria-label={t("dms.attachFile")}
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          data-dm-attach-file=""
        >
          <Icon name="paperclip" size={18} />
        </button>
        {/* sr-only labels properly associate with the inputs (Phase 5 requirement). */}
        <label htmlFor={`dm-image-input-${conversationId}`} className="sr-only">{t("dms.attachImage")}</label>
        <input
          id={`dm-image-input-${conversationId}`}
          ref={imageInputRef}
          type="file"
          accept={DM_IMAGE_ACCEPT}
          multiple
          onChange={() => void handleSelection(imageInputRef.current!, "image")}
          className="sr-only"
          tabIndex={-1}
        />
        <label htmlFor={`dm-file-input-${conversationId}`} className="sr-only">{t("dms.attachFile")}</label>
        <input
          id={`dm-file-input-${conversationId}`}
          ref={fileInputRef}
          type="file"
          accept={DM_FILE_ACCEPT}
          multiple
          onChange={() => void handleSelection(fileInputRef.current!, "file")}
          className="sr-only"
          tabIndex={-1}
        />

        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("dms.placeholder")}
          maxLength={2000}
          className="min-h-10 min-w-0 flex-1 rounded-pill border border-border bg-surface-2 px-3 text-meta text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={t("dms.send")}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-accent-primary text-on-accent transition hover:brightness-110 disabled:opacity-40"
        >
          <Icon name="send" size={16} />
        </button>
      </form>
    </div>
  );
}