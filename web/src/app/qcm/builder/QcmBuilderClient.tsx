"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Button,
  DailyQuestionsBanner,
  isDailyLimitError,
  PageShell,
  SessionBuilder,
  type SessionBuilderPrefill,
  type SessionConfig,
} from "@/components";
import type { SessionDetail } from "@/lib/types";

export interface QcmBuilderClientProps {
  initialMode?: "practice" | "exam";
}

export default function QcmBuilderClient({ initialMode = "practice" }: QcmBuilderClientProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();
  const { t } = useLanguage();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [quotaKey, setQuotaKey] = useState(0);
  // "Repeat my last quiz" — prefill hydrated from the newest session's derived
  // config echo. idle: button ready; loading: fetching; none: nothing to repeat.
  const [prefill, setPrefill] = useState<SessionBuilderPrefill | null>(null);
  const [repeatState, setRepeatState] = useState<"idle" | "loading" | "none" | "error">("idle");

  function handleLogout() {
    logout();
    router.push("/login");
  }

  async function handleRepeatLast() {
    setRepeatState("loading");
    try {
      const list = await apiFetch<{ sessions: Array<{ id: string }> }>("/sessions?page=1&limit=1");
      const lastId = list.sessions[0]?.id;
      if (!lastId) {
        setRepeatState("none");
        return;
      }
      const { session } = await apiFetch<{ session: SessionDetail }>(`/sessions/${lastId}`);
      const echo = session.config;
      if (!echo) {
        setRepeatState("none");
        return;
      }
      setPrefill({
        mode: echo.mode,
        size: echo.size,
        timeLimitSeconds: echo.timeLimitSeconds,
        resultSort: echo.resultSort,
        showStats: echo.showStats,
        questionTypes: echo.questionTypes.filter(
          (type): type is SessionBuilderPrefill["questionTypes"][number] =>
            type === "QCM" || type === "QCS" || type === "QROC" || type === "CLINICAL_CASE"
        ),
        moduleIds: echo.moduleIds,
        unitIds: echo.unitIds,
      });
      setRepeatState("idle");
    } catch {
      setRepeatState("error");
    }
  }

  async function handleStart(config: SessionConfig) {
    setIsStarting(true);
    setStartError(null);
    try {
      const { session } = await apiFetch<{ session: { id: string } }>("/sessions", {
        method: "POST",
        body: JSON.stringify({
          name: config.name,
          mode: config.mode,
          ...(config.facultyId ? { facultyId: config.facultyId } : {}),
          ...(config.yearId ? { yearId: config.yearId } : {}),
          ...(config.moduleIds && config.moduleIds.length > 0 ? { moduleIds: config.moduleIds } : {}),
          ...(config.unitIds && config.unitIds.length > 0 ? { unitIds: config.unitIds } : {}),
          questionTypes: config.questionTypes,
          ...(config.source ? { source: config.source } : {}),
          ...(config.examYear !== undefined ? { examYear: config.examYear } : {}),
          ...(config.sittingLabel ? { sittingLabel: config.sittingLabel } : {}),
          ...(config.examYearFrom !== undefined ? { examYearFrom: config.examYearFrom } : {}),
          ...(config.examYearTo !== undefined ? { examYearTo: config.examYearTo } : {}),
          size: config.size,
          sort: config.resultSort,
          showStats: config.showStats,
          ...(config.mode === "exam" && config.timeLimitSeconds
            ? { timeLimitSeconds: config.timeLimitSeconds }
            : {}),
        }),
      });
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      if (isDailyLimitError(err)) {
        setStartError(t("quota.reachedDesc"));
        setQuotaKey((key) => key + 1);
      } else {
        setStartError(err instanceof ApiError ? err.message : t("qcmBuilder.startError"));
      }
      setIsStarting(false);
    }
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      back={{ href: "/qcm", label: t("qcmBuilder.back") }}
      title={t("qcmBuilder.title")}
      description={t("qcmBuilder.subtitle")}
    >
      {(authed) => (
        <>
          <DailyQuestionsBanner refreshKey={quotaKey} className="mt-section-gap" />
          <div className="mt-section-gap flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRepeatLast}
              disabled={repeatState === "loading"}
            >
              {repeatState === "loading" ? t("builder.repeatLoading") : t("builder.repeatLast")}
            </Button>
            {repeatState === "none" ? (
              <span className="text-meta text-text-tertiary">{t("builder.repeatNone")}</span>
            ) : null}
            {repeatState === "error" ? (
              <span className="text-meta text-danger">{t("qcmBuilder.startError")}</span>
            ) : null}
          </div>
          <SessionBuilder
            className="mt-section-gap"
            initialMode={initialMode}
            initialFacultyId={authed.facultyId ?? null}
            initialYearId={authed.yearId ?? null}
            prefill={prefill}
            onStart={handleStart}
            isStarting={isStarting}
            startError={startError}
          />
          <p className="mt-4 text-center text-meta text-text-tertiary">{t("qcmBuilder.footnote")}</p>
        </>
      )}
    </PageShell>
  );
}
