"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { parseShare } from "@/lib/share-message";
import { formatDmBytes } from "@/lib/dm-types";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";

interface FriendRow {
  id: string;
  fullName: string | null;
}

export function MessageBody({ body }: { body: string }) {
  const { t } = useLanguage();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const share = parseShare(body);
  if (!share) return <p className="whitespace-pre-wrap break-words">{body}</p>;
  const note = share.note ? <p className="mt-1 whitespace-pre-wrap break-words">{share.note}</p> : null;
  if (share.kind === "image") {
    // Uploaded attachments are data: URLs. <a href={dataUrl} target="_blank">
    // is blocked by every browser (top-frame navigation to data: URLs is
    // disallowed — Chrome 60+, Firefox, Safari) and renders the blank/black
    // tab the receiver reported. So data-URL photos open an in-app lightbox
    // (no navigation at all); only https photo links — a real external page —
    // keep the new-tab behaviour.
    const isAttachment = share.url.startsWith("data:");
    const img = <img src={share.url} alt={share.name ?? ""} className="max-h-48 max-w-full rounded-control" />;
    return (
      <div>
        {isAttachment ? (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-haspopup="dialog"
            aria-label={t("dms.viewPhoto")}
            className="block cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {img}
          </button>
        ) : (
          <a href={share.url} target="_blank" rel="noreferrer">{img}</a>
        )}
        {note}
        {isAttachment ? (
          <Modal
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            title={share.name ?? "Photo"}
            className="max-w-lg"
          >
            <img src={share.url} alt={share.name ?? ""} className="max-h-[70vh] w-full rounded-control" />
            <a
              href={share.url}
              download={share.name ?? "photo"}
              className="mt-3 inline-flex rounded-control border border-border px-3 py-1.5 text-caption font-medium text-text-primary transition hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {t("dms.downloadPhoto")}
            </a>
          </Modal>
        ) : null}
      </div>
    );
  }
  if (share.kind === "file") {
    return (
      <div>
        <a
          href={share.url}
          download={share.name}
          className="flex items-center gap-2 rounded-control bg-surface-1/60 px-2 py-1.5 text-caption hover:bg-surface-2"
        >
          <Icon name="paperclip" size={14} className="shrink-0" />
          <span className="min-w-0 truncate font-medium">{share.name}</span>
          <span className="shrink-0 whitespace-nowrap text-text-tertiary">{formatDmBytes(share.size)}</span>
        </a>
        {note}
      </div>
    );
  }
  const href = share.kind === "question" ? `/units/${share.unitId}` : `/resources/${share.id}`;
  return (
    <div>
      <Link href={href} className="block font-medium underline underline-offset-2">
        {share.title || (share.kind === "question" ? "Question" : "Ressource")}
      </Link>
      {note}
    </div>
  );
}

/** Opens the accepted-friend list and drops this question into that chat. */
export function ShareWithFriend({ questionId }: { questionId: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setError(null);
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    try {
      const data = await apiFetch<{ friends: FriendRow[] }>("/friends");
      setFriends(data.friends);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("friends.noResults"));
    }
  }

  async function send(friendId: string) {
    setBusy(true);
    setError(null);
    try {
      const opened = await apiFetch<{ conversation: { id: string } }>("/dms/conversations", {
        method: "POST",
        body: JSON.stringify({ userId: friendId }),
      });
      await apiFetch(`/dms/conversations/${opened.conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ questionId }),
      });
      setSentTo(friendId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dms.sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        className="inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-3 text-meta font-medium text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        {t("friends.share")}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-card border border-border bg-surface-1 p-2 shadow-card">
          <p className="px-2 py-1 text-meta font-medium text-text-secondary">{t("friends.shareWith")}</p>
          {error ? <p className="px-2 py-1 text-caption text-danger">{error}</p> : null}
          {friends.length === 0 ? (
            <p className="px-2 py-2 text-caption text-text-tertiary">{t("dashboard.noFriends")}</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {friends.map((friend) => (
                <li key={friend.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void send(friend.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-control px-2 py-2 text-left text-body text-text-primary hover:bg-surface-2 disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate">{friend.fullName ?? "—"}</span>
                    <span className="shrink-0 text-caption text-accent-soft">
                      {sentTo === friend.id ? t("friends.shared") : t("dms.send")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
