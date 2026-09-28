"use client";

import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import type { ReviewQueueItem } from "@/lib/types";

export interface ReviewCardProps {
  item: ReviewQueueItem;
  isSubmitting?: boolean;
  error?: string | null;
  onApprove: () => void;
  onRejectStart: () => void;
  onRejectCancel: () => void;
  onRejectConfirm: () => void;
  rejecting?: boolean;
  rejectComment: string;
  onRejectCommentChange: (value: string) => void;
}

function itemTitle(item: ReviewQueueItem): string {
  return item.contentType === "lesson" ? item.lessonTitle : `${item.type} question`;
}

const primaryButton =
  "flex-1 rounded-control bg-accent-primary px-4 py-2 text-sm font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none";
const dangerButton =
  "flex-1 rounded-control bg-danger px-4 py-2 text-sm font-medium text-background transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none";
const secondaryButton =
  "flex-1 rounded-control border border-border px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none";

/** Review-queue item card with approve, inline reject (comment required), and per-item error. */
export function ReviewCard({
  item,
  isSubmitting = false,
  error,
  onApprove,
  onRejectStart,
  onRejectCancel,
  onRejectConfirm,
  rejecting = false,
  rejectComment,
  onRejectCommentChange,
}: ReviewCardProps) {
  const { lang, t } = useLanguage();
  const textareaId = `reject-comment-${item.id}`;

  return (
    <li className="rounded-card border border-border bg-surface-1 px-card-padding py-4 shadow-card">
      <p className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{item.contentType}</p>
      <p className="mt-1 text-body font-medium text-text-primary">{itemTitle(item)}</p>
      {item.snippet ? <p className="mt-1 text-meta text-text-secondary">{item.snippet}</p> : null}
      <p className="mt-2 text-caption text-text-tertiary">
        {item.authorFullName ?? t("modcard.unknownAuthor")} · {new Date(item.createdAt).toLocaleString(localeFor(lang), { dateStyle: "medium", timeStyle: "short" })}
      </p>

      {!rejecting ? (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onApprove} disabled={isSubmitting} className={primaryButton}>
            {isSubmitting ? t("modcard.approving") : t("modcard.approve")}
          </button>
          <button type="button" onClick={onRejectStart} disabled={isSubmitting} className={secondaryButton}>
            {t("modcard.reject")}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <label htmlFor={textareaId} className="block text-meta font-medium text-text-secondary">
            {t("modcard.rejectReason")}
          </label>
          <textarea
            id={textareaId}
            rows={3}
            value={rejectComment}
            onChange={(event) => onRejectCommentChange(event.target.value)}
            disabled={isSubmitting}
            className="mt-1 w-full rounded-input border border-border bg-surface-2 px-3 py-2 text-meta text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
          />
          {rejectComment.trim().length === 0 && !isSubmitting ? (
            <p className="mt-1 text-caption text-text-tertiary">{t("modcard.commentRequired")}</p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onRejectConfirm}
              disabled={isSubmitting || rejectComment.trim().length === 0}
              className={dangerButton}
            >
              {isSubmitting ? t("modcard.rejecting") : t("modcard.confirmReject")}
            </button>
            <button type="button" onClick={onRejectCancel} disabled={isSubmitting} className={secondaryButton}>
              {t("modcard.cancel")}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className={cx("mt-2 rounded-control border border-danger bg-surface-2 px-3 py-2 text-meta text-danger")}>
          {error}
        </p>
      ) : null}
    </li>
  );
}
