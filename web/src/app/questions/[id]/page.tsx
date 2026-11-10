"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { apiFetch, ApiError } from "@/lib/api";
import { EmptyState, PageShell, isDailyLimitError } from "@/components";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OpenFailure = "unavailable" | "limit" | "failed";
type OpenResult = { ok: true; sessionId: string } | { ok: false; reason: OpenFailure };

// One in-flight open per question, so React strict-mode's double mount
// does not create two practice sessions for the same link.
const openings = new Map<string, Promise<OpenResult>>();

function openSharedQuestion(questionId: string, name: string): Promise<OpenResult> {
  const existing = openings.get(questionId);
  if (existing) return existing;
  const pending = (async (): Promise<OpenResult> => {
    const listed = await apiFetch<{ questions: { id: string }[]; pagination: { total: number } }>(
      `/questions?ids=${questionId}&limit=1`
    );
    if ((listed.pagination?.total ?? 0) < 1) return { ok: false, reason: "unavailable" };
    const { session } = await apiFetch<{ session: { id: string; questions?: unknown[] } }>("/sessions", {
      method: "POST",
      body: JSON.stringify({
        name,
        mode: "practice",
        questionIds: [questionId],
        size: 1,
      }),
    });
    if (!session.questions || session.questions.length === 0) return { ok: false, reason: "unavailable" };
    return { ok: true, sessionId: session.id };
  })().catch((err: unknown): OpenResult => {
    openings.delete(questionId);
    if (isDailyLimitError(err)) return { ok: false, reason: "limit" };
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: false, reason: "failed" };
  });
  openings.set(questionId, pending);
  return pending;
}

/** Shared-question link: open that one question as a practice session. */
export default function SharedQuestionPage() {
  const params = useParams<{ id: string }>();
  const questionId = params.id;
  const router = useRouter();
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const [failure, setFailure] = useState<OpenFailure | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const invalidId = !UUID_PATTERN.test(questionId);

  useEffect(() => {
    if (!isHydrated || !user || invalidId) return;
    let cancelled = false;
    void openSharedQuestion(questionId, t("share.practiceName")).then((result) => {
      if (cancelled) return;
      if (result.ok) router.replace(`/sessions/${result.sessionId}`);
      else setFailure(result.reason);
    });
    return () => {
      cancelled = true;
    };
  }, [isHydrated, user, questionId, invalidId, retryKey, router, t]);

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      back={{ href: "/messages", label: t("dms.backToList") }}
      title={t("share.questionLabel")}
      description={failure || invalidId ? undefined : t("share.opening")}
    >
      {failure === "limit" ? (
        <EmptyState
          title={t("share.openFailed")}
          description={t("quota.reachedDesc")}
          action={{ label: t("dms.backToList"), href: "/messages" }}
        />
      ) : invalidId || failure === "unavailable" ? (
        <EmptyState
          title={t("share.unavailable")}
          description={t("share.unavailable")}
          action={{ label: t("dms.backToList"), href: "/messages" }}
        />
      ) : failure === "failed" ? (
        <EmptyState
          title={t("share.openFailed")}
          description={t("dms.sendFailed")}
          action={{
            label: t("common.retry"),
            onClick: () => {
              openings.delete(questionId);
              setFailure(null);
              setRetryKey((key) => key + 1);
            },
          }}
        />
      ) : (
        <p className="text-body text-text-secondary">{t("share.opening")}</p>
      )}
    </PageShell>
  );
}
