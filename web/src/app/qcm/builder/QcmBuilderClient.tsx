"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import {
  DailyQuestionsBanner,
  isDailyLimitError,
  PageShell,
  SessionBuilder,
  type SessionConfig,
} from "@/components";

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

  function handleLogout() {
    logout();
    router.push("/login");
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
          ...(config.moduleId ? { moduleIds: [config.moduleId] } : {}),
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
          <SessionBuilder
            className="mt-section-gap"
            initialMode={initialMode}
            initialFacultyId={authed.facultyId ?? null}
            initialYearId={authed.yearId ?? null}
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
