"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, Footer, LoadingSkeleton, SessionBuilder, type SessionConfig } from "@/components";

export interface QcmBuilderClientProps {
  initialMode?: "practice" | "exam";
}

export default function QcmBuilderClient({ initialMode = "practice" }: QcmBuilderClientProps) {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

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
      setStartError(
        err instanceof ApiError
          ? err.message
          : "Impossible de créer la session. Vérifiez votre connexion et réessayez."
      );
      setIsStarting(false);
    }
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" ariaLabel="Chargement" />
      </main>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-card-padding py-section-gap">
        <Link
          href="/qcm"
          className="inline-flex min-h-touch-target items-center gap-1 text-body font-medium text-accent-soft transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span aria-hidden>←</span> Retour à la banque QCM
        </Link>

        <h1 className="mt-2 font-display text-h1 font-bold leading-tight text-text-primary">
          Configurer une session
        </h1>
        <p className="mt-2 text-body text-text-secondary">
          Filtrez par domaine, choisissez les types de questions, puis lancez votre session — la correction suit le
          mode sélectionné.
        </p>

        <SessionBuilder
          className="mt-section-gap"
          initialMode={initialMode}
          initialFacultyId={user.facultyId ?? null}
          initialYearId={user.yearId ?? null}
          onStart={handleStart}
          isStarting={isStarting}
          startError={startError}
        />

        <p className="mt-4 text-center text-meta text-text-tertiary">
          Les sessions QCM sont gratuites et illimitées pour tous les membres.
        </p>
      </main>

      <Footer />
    </>
  );
}
