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
  if (share.kind === "question") {
    return (
      <div>
        <SharedQuestionCard
          text={share.text ?? share.title}
          options={share.options}
          module={share.module}
          unit={share.unit}
          sitting={share.sitting}
          href={`/questions/${share.id}`}
        />
        {note}
      </div>
    );
  }
  return (
    <div>
      <Link href={`/resources/${share.id}`} className="block font-medium underline underline-offset-2">
        {share.title || t("share.resourceFallback")}
      </Link>
      {note}
    </div>
  );
}

const LETTERS = "ABCDEFGHIJ".split("");

export interface SharedQuestionPreview {
  text: string;
  options?: string[];
  module?: string;
  unit?: string;
  sitting?: string;
}

/** "Screenshot" of a shared question: chips, stem, lettered choices, open link. */
export function SharedQuestionCard({ text, options, module, unit, sitting, href }: SharedQuestionPreview & { href?: string }) {
  const { t } = useLanguage();
  const chips = [module, unit, sitting].filter((chip): chip is string => Boolean(chip));
  return (
    <div className="w-full max-w-sm overflow-hidden rounded-input border border-border bg-surface-1 text-left text-text-primary shadow-card">
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-3 py-1.5 text-caption font-semibold uppercase tracking-wide text-accent-soft">
        <Icon name="qcm" size={12} />
        {t("share.questionLabel")}
      </div>
      <div className="px-3 py-2.5">
        {chips.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {chips.map((chip) => (
              <span key={chip} className="max-w-full truncate rounded-pill bg-surface-3 px-2 py-0.5 text-caption text-text-secondary">
                {chip}
              </span>
            ))}
          </div>
        ) : null}
        <p className="line-clamp-5 whitespace-pre-line text-meta font-medium leading-relaxed">{text || t("share.questionFallback")}</p>
        {options && options.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {options.map((option, index) => (
              <li key={index} className="flex items-start gap-2 text-caption text-text-secondary">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold">
                  {LETTERS[index]}
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 pt-0.5">{option}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="flex items-center justify-center gap-1.5 border-t border-border px-3 py-2 text-meta font-semibold text-accent-soft transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {t("share.openQuestion")}
          <Icon name="chevronRight" size={14} />
        </Link>
      ) : null}
    </div>
  );
}

/** Share modal: preview of what the friend receives, optional note, copy link. */
export function ShareWithFriend({ questionId, preview }: { questionId: string; preview?: SharedQuestionPreview }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("");

  async function openModal() {
    setError(null);
    setSent({});
    setNote("");
    setCopied(false);
    setFilter("");
    setOpen(true);
    try {
      const data = await apiFetch<{ friends: FriendRow[] }>("/friends");
      setFriends(data.friends);
    } catch (err) {
      setFriends([]);
      setError(err instanceof ApiError ? err.message : t("dms.sendFailed"));
    }
  }

  async function send(friendId: string) {
    setBusyId(friendId);
    setError(null);
    try {
      const opened = await apiFetch<{ conversation: { id: string } }>("/dms/conversations", {
        method: "POST",
        body: JSON.stringify({ userId: friendId }),
      });
      await apiFetch(`/dms/conversations/${opened.conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ questionId, ...(note.trim() ? { body: note.trim() } : {}) }),
      });
      setSent((prev) => ({ ...prev, [friendId]: opened.conversation.id }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dms.sendFailed"));
    } finally {
      setBusyId(null);
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/questions/${questionId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt(t("share.copyLink"), url);
    }
  }

  const visibleFriends = (friends ?? []).filter((friend) =>
    (friend.fullName ?? "").toLowerCase().includes(filter.trim().toLowerCase())
  );

  return (
    <>
      <button
        type="button"
        onClick={() => void openModal()}
        aria-haspopup="dialog"
        className="inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-3 text-meta font-medium text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        {t("friends.share")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("friends.shareWith")} className="max-w-md">
        <div className="flex flex-col gap-3">
          {preview ? (
            <div className="flex justify-center">
              <SharedQuestionCard {...preview} />
            </div>
          ) : null}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 500))}
            rows={2}
            placeholder={t("share.notePh")}
            className="w-full rounded-input border border-border bg-surface-2 px-3 py-2 text-meta text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="inline-flex min-h-touch-target items-center justify-center gap-2 rounded-control border border-border px-3 text-meta font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Icon name={copied ? "check" : "paperclip"} size={14} />
            {copied ? t("share.linkCopied") : t("share.copyLink")}
          </button>

          {error ? (
            <p role="alert" className="text-caption text-danger">
              {error}
            </p>
          ) : null}

          {friends === null ? (
            <p className="text-caption text-text-tertiary">{t("common.loadingMore")}</p>
          ) : friends.length === 0 ? (
            <p className="text-caption text-text-tertiary">{t("dashboard.noFriends")}</p>
          ) : (
            <>
              {friends.length > 5 ? (
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t("share.searchFriend")}
                  className="min-h-touch-target w-full rounded-input border border-border bg-surface-2 px-3 text-meta text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                />
              ) : null}
              {visibleFriends.length === 0 ? (
                <p className="text-caption text-text-tertiary">{t("friends.noResults")}</p>
              ) : (
              <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
                {visibleFriends.map((friend) => {
                  const conversationId = sent[friend.id];
                  return (
                    <li key={friend.id} className="flex items-center gap-2 rounded-input px-2 py-1.5 hover:bg-surface-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-meta font-semibold text-text-secondary">
                        {(friend.fullName ?? "?").trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body text-text-primary">{friend.fullName ?? "—"}</span>
                      {conversationId ? (
                        <Link
                          href={`/messages?c=${conversationId}`}
                          className="shrink-0 text-caption font-semibold text-success underline-offset-2 hover:underline"
                        >
                          {t("friends.shared")} · {t("share.openChat")}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => void send(friend.id)}
                          className="inline-flex min-h-9 shrink-0 items-center rounded-control bg-accent-qcm px-3 text-caption font-semibold text-on-accent transition hover:brightness-110 disabled:opacity-50"
                        >
                          {busyId === friend.id ? t("qcard.sending") : t("dms.send")}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
