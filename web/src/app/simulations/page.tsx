"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, EmptyState, Footer, LoadingSkeleton } from "@/components";

type SimulationStatus = "scheduled" | "live" | "completed" | "cancelled";

interface SimulationItem {
  id: string;
  title: string;
  description: string | null;
  faculty: { id: string; name: string };
  year: { id: string; label: string } | null;
  scheduledAt: string;
  endsAt: string;
  durationMinutes: number;
  questionCount: number;
  status: SimulationStatus;
  registeredCount: number;
  registered: boolean;
}

function formatWhen(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleString(localeFor(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function SimulationCard({
  sim,
  busyId,
  actionError,
  onRegister,
  onUnregister,
  onStart,
}: {
  sim: SimulationItem;
  busyId: string | null;
  actionError: string | null;
  onRegister: (id: string) => void;
  onUnregister: (id: string) => void;
  onStart: (id: string) => void;
}) {
  const { lang, t } = useLanguage();
  const busy = busyId === sim.id;
  const terminal = sim.status === "completed" || sim.status === "cancelled";

  return (
    <article className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-h3 font-semibold text-text-primary">{sim.title}</h3>
        {sim.status === "live" ? (
          <span className="rounded-pill border border-danger/50 bg-danger/10 px-2.5 py-0.5 text-caption font-semibold text-danger">
            {t("sims.live")}
          </span>
        ) : sim.status === "cancelled" ? (
          <span className="rounded-pill border border-border bg-surface-3 px-2.5 py-0.5 text-caption font-medium text-text-tertiary">
            {t("sims.cancelled")}
          </span>
        ) : sim.status === "completed" ? (
          <span className="rounded-pill border border-border bg-surface-3 px-2.5 py-0.5 text-caption font-medium text-text-tertiary">
            {t("sims.completed")}
          </span>
        ) : sim.registered ? (
          <span className="rounded-pill border border-accent-qcm/50 bg-accent-qcm/10 px-2.5 py-0.5 text-caption font-medium text-accent-soft">
            {t("sims.registered")}
          </span>
        ) : null}
      </div>

      {sim.description ? (
        <p className="mt-1 text-body text-text-secondary">{sim.description}</p>
      ) : null}

      <p className="mt-2 text-meta text-text-secondary">
        {sim.faculty.name}
        {sim.year ? ` · ${sim.year.label}` : null}
      </p>
      <p className="mt-0.5 text-meta tabular-nums text-text-secondary">
        {t("sims.meta", { q: sim.questionCount, d: sim.durationMinutes })}
        {" · "}
        {t(sim.registeredCount === 1 ? "sims.seatsOne" : "sims.seatsMany", {
          count: sim.registeredCount,
        })}
      </p>
      <p className="mt-0.5 text-meta tabular-nums text-text-tertiary">
        {t("sims.startsAt", { date: formatWhen(sim.scheduledAt, lang) })}
        {" · "}
        {t("sims.endsAt", { date: formatWhen(sim.endsAt, lang) })}
      </p>

      {!terminal ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {sim.status === "live" && sim.registered ? (
            <button
              type="button"
              onClick={() => onStart(sim.id)}
              disabled={busy}
              className="inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-semibold text-on-accent shadow-glow-qcm transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 sm:flex-none"
            >
              {t("sims.start")}
            </button>
          ) : null}
          {sim.status === "scheduled" ? (
            sim.registered ? (
              <button
                type="button"
                onClick={() => onUnregister(sim.id)}
                disabled={busy}
                className="inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50"
              >
                {t("sims.unregister")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onRegister(sim.id)}
                disabled={busy}
                className="inline-flex min-h-touch-target flex-1 items-center justify-center rounded-control bg-accent-primary px-4 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 sm:flex-none"
              >
                {t("sims.register")}
              </button>
            )
          ) : null}
        </div>
      ) : null}

      {busyId === sim.id && actionError ? (
        <p role="alert" className="mt-2 text-meta text-danger">
          {actionError}
        </p>
      ) : null}
    </article>
  );
}

export default function SimulationsPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;

  const simsRes = useApiResource<{ simulations: SimulationItem[] }>(canFetch ? "/simulations" : null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  async function mutate(id: string, path: string, method: string, onOk: () => void) {
    setBusyId(id);
    setActionError(null);
    try {
      await apiFetch(path, { method });
      onOk();
      await simsRes.refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("player.submitError"));
    } finally {
      setBusyId(null);
    }
  }

  function handleStart(id: string) {
    setBusyId(id);
    setActionError(null);
    apiFetch<{ session: { id: string } }>(`/simulations/${id}/start`, { method: "POST" })
      .then(({ session }) => router.push(`/sessions/${session.id}`))
      .catch((err: unknown) => {
        setActionError(err instanceof ApiError ? err.message : t("player.submitError"));
        setBusyId(null);
      });
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" ariaLabel={t("common.loading")} />
      </main>
    );
  }

  const sims = simsRes.data?.simulations ?? [];
  const live = sims.filter((s) => s.status === "live");
  const upcoming = sims.filter((s) => s.status === "scheduled");
  const past = sims.filter((s) => s.status === "completed" || s.status === "cancelled");

  function renderSection(
    titleKey: "sims.live" | "sims.upcoming" | "sims.past",
    emptyKey: "sims.emptyLive" | "sims.emptyUpcoming" | "sims.emptyPast",
    items: SimulationItem[]
  ) {
    return (
      <section aria-label={t(titleKey)} className="mx-auto mt-section-gap max-w-4xl">
        <h2 className="font-display text-h2 font-semibold text-text-primary">{t(titleKey)}</h2>
        {items.length === 0 ? (
          <p className="mt-2 text-body text-text-tertiary">{t(emptyKey)}</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {items.map((sim) => (
              <SimulationCard
                key={sim.id}
                sim={sim}
                busyId={busyId}
                actionError={actionError}
                onRegister={(id) => void mutate(id, `/simulations/${id}/register`, "POST", () => undefined)}
                onUnregister={(id) => void mutate(id, `/simulations/${id}/register`, "DELETE", () => undefined)}
                onStart={handleStart}
              />
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-card-padding py-section-gap">
        <section aria-label={t("nav.simulations")} className="mx-auto max-w-3xl text-center">
          <h1 className="mt-2 font-display text-h1 font-bold leading-tight text-text-primary md:text-hero">
            {t("nav.simulations")}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary">{t("sims.subtitle")}</p>
        </section>

        {simsRes.isLoading && sims.length === 0 ? (
          <div className="mx-auto mt-section-gap flex max-w-4xl flex-col gap-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} className="h-28 w-full rounded-card" />
            ))}
          </div>
        ) : simsRes.error ? (
          <div className="mx-auto mt-section-gap max-w-4xl rounded-card border border-danger bg-surface-1 p-card-padding">
            <p role="alert" className="text-body text-danger">
              {t("sims.loadError")}
            </p>
            <button
              type="button"
              onClick={() => void simsRes.refetch()}
              className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:w-auto"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : (
          <>
            {renderSection("sims.live", "sims.emptyLive", live)}
            {renderSection("sims.upcoming", "sims.emptyUpcoming", upcoming)}
            {renderSection("sims.past", "sims.emptyPast", past)}
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
