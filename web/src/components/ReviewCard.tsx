"use client";

import { useLanguage } from "@/context/LanguageContext";
import { localeFor } from "@/lib/i18n";
import type { ReviewQueueItem } from "@/lib/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { Textarea } from "@/components/Field";

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
    <Card as="li" padded={false} className="px-card-padding py-4">
      <p className="text-caption font-medium uppercase tracking-wide text-text-tertiary">{item.contentType}</p>
      <p className="mt-1 text-body font-medium text-text-primary">{itemTitle(item)}</p>
      {item.snippet ? <p className="mt-1 text-meta text-text-secondary">{item.snippet}</p> : null}
      <p className="mt-2 text-caption text-text-tertiary">
        {item.authorFullName ?? t("modcard.unknownAuthor")} · {new Date(item.createdAt).toLocaleString(localeFor(lang), { dateStyle: "medium", timeStyle: "short" })}
      </p>

      {!rejecting ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onApprove} disabled={isSubmitting} className="flex-1">
            {isSubmitting ? t("modcard.approving") : t("modcard.approve")}
          </Button>
          <Button size="sm" variant="outline" onClick={onRejectStart} disabled={isSubmitting} className="flex-1">
            {t("modcard.reject")}
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <Textarea
            id={textareaId}
            label={t("modcard.rejectReason")}
            rows={3}
            value={rejectComment}
            onChange={(event) => onRejectCommentChange(event.target.value)}
            disabled={isSubmitting}
            hint={rejectComment.trim().length === 0 && !isSubmitting ? t("modcard.commentRequired") : undefined}
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={onRejectConfirm}
              disabled={isSubmitting || rejectComment.trim().length === 0}
              className="flex-1"
            >
              {isSubmitting ? t("modcard.rejecting") : t("modcard.confirmReject")}
            </Button>
            <Button size="sm" variant="outline" onClick={onRejectCancel} disabled={isSubmitting} className="flex-1">
              {t("modcard.cancel")}
            </Button>
          </div>
        </div>
      )}

      {error ? <ErrorState message={error} className="mt-2" /> : null}
    </Card>
  );
}
