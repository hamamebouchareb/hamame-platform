"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import {
  AppHeader,
  Footer,
  FriendsPanel,
  LoadingSkeleton,
  MetricCard,
  PremiumCard,
  PrimaryTabs,
  ProfileHero,
  ResumeBar,
  WeeklyActivity,
} from "@/components";
import type {
  AiCredits,
  ExamReadiness,
  FriendSummary,
  ProgressSummary,
  RecentActivityItem,
  Subscription,
} from "@/lib/types";

const HEADER_NAV = [
  { href: "/dashboard", label: "Tableau de bord", active: true },
  { href: "/qcm", label: "QCM" },
  { href: "/suivi", label: "Suivi" },
  { href: "/revision", label: "Révision" },
  { href: "/notes", label: "Notes" },
  { href: "/subscription", label: "Abonnement" },
];

// Study-space navigation — the four Hamame pillars.
const STUDY_TABS = [
  { id: "qcm", label: "QCM" },
  { id: "bibliotheque", label: "Bibliothèque" },
  { id: "suivi", label: "Suivi" },
  { id: "revision", label: "Révision" },
];

const STUDY_DESTINATIONS: Record<string, string | null> = {
  qcm: "/qcm",
  bibliotheque: "/faculties",
  suivi: "/suivi",
  revision: "/revision",
};

// Interrupted-session marker written by /sessions/[id] (see that page's persistence
// effect). localStorage is deliberate — the backend has no active-session endpoint.
const ACTIVE_SESSION_KEY = "hamame_active_session";

interface ActiveSession {
  id: string;
  name: string;
}

function readActiveSession(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSession;
    return parsed && parsed.id ? parsed : null;
  } catch {
    return null;
  }
}

function readinessLabelFr(label: ExamReadiness["label"]): string {
  switch (label) {
    case "Needs work":
      return "À travailler";
    case "On track":
      return "Sur la bonne voie";
    case "Exam ready":
      return "Prêt pour l'examen";
    default:
      return "Indisponible";
  }
}

function readinessTone(label: ExamReadiness["label"]): "primary" | "success" | "warning" {
  switch (label) {
    case "Exam ready":
      return "success";
    case "On track":
      return "primary";
    default:
      return "warning";
  }
}

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || fullName;
}

function formatActivity(item: RecentActivityItem): { title: string; subtitle: string; href: string } {
  if (item.type === "session") {
    const scoreLabel = item.score === null ? "non noté" : `${item.score}%`;
    return {
      title: item.name,
      subtitle: `Session ${item.mode} · ${scoreLabel}`,
      href: `/sessions/${item.id}/results`,
    };
  }
  return {
    title: item.title,
    subtitle: "Leçon consultée",
    href: `/lessons/${item.lessonId}`,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-DZ", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-DZ", { dateStyle: "medium" });
}

function isCreditsLow(credits: AiCredits): boolean {
  if (credits.dailyAllowance <= 0) return false;
  return credits.remainingToday > 0 && credits.remainingToday / credits.dailyAllowance < 0.2;
}

export default function DashboardPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();
  const canFetch = isHydrated && !!user;

  const progress = useApiResource<ProgressSummary>(canFetch ? "/progress/me" : null);
  const readiness = useApiResource<ExamReadiness>(canFetch ? "/progress/readiness" : null);
  const credits = useApiResource<AiCredits>(canFetch ? "/ai/credits" : null);
  const friends = useApiResource<{ friends: FriendSummary[] }>(canFetch ? "/friends" : null);
  const dueReviews = useApiResource<{ items: { id: string; dueAt: string }[] }>(canFetch ? "/reviews/due" : null);
  const subscription = useApiResource<{ subscription: Subscription | null }>(canFetch ? "/subscriptions/me" : null);

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

  // Sync-with-external-system read: localStorage is unavailable during SSR, so the
  // resume marker can only be picked up once the client hydrates. Same convention as
  // the notes page / useApiResource.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setActiveSession(readActiveSession());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleLogout() {
    logout();
    router.push("/login");
  }

  function retryReadiness() {
    router.refresh();
    window.location.reload();
  }

  function handleStudyTab(id: string) {
    const destination = STUDY_DESTINATIONS[id];
    if (!destination) return;
    if (destination.startsWith("#")) {
      document.getElementById(destination.slice(1))?.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push(destination);
    }
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <p className="text-meta text-text-secondary">Chargement...</p>
      </main>
    );
  }

  const hasAnyActivity =
    (progress.data?.totalCompletedSessions ?? 0) > 0 || (progress.data?.recentActivity.length ?? 0) > 0;
  const recentItems = (progress.data?.recentActivity ?? []).slice(0, 5);
  const readinessData = readiness.data && !readiness.data.insufficientData ? readiness.data : null;
  const dueReviewCount = dueReviews.data?.items?.length ?? 0;

  const currentSubscription = subscription.data?.subscription ?? null;
  const subscriptionPrice =
    currentSubscription?.plan.priceDzd != null
      ? `${currentSubscription.plan.priceDzd.toLocaleString("fr-DZ")} DZD${
          currentSubscription.plan.billingPeriod === "yearly"
            ? " / an"
            : currentSubscription.plan.billingPeriod === "monthly"
              ? " / mois"
              : ""
        }`
      : undefined;

  const resumeBar = activeSession
    ? {
        title: `Session « ${activeSession.name} »`,
        subtitle: "Reprenez où vous en étiez.",
        meta: "En cours",
        primaryLabel: "Reprendre l'étude",
        primaryHref: `/sessions/${activeSession.id}`,
      }
    : hasAnyActivity
      ? {
          title: "Poursuivez votre préparation",
          subtitle:
            dueReviewCount > 0
              ? "Des révisions vous attendent, puis gardez votre série avec une session QCM."
              : "Enchaînez avec une session QCM pour garder votre série.",
          meta: dueReviewCount > 0 ? `${dueReviewCount} révision${dueReviewCount > 1 ? "s" : ""} à faire` : undefined,
          primaryLabel: "Reprendre l'étude",
          primaryHref: "/qcm",
        }
      : {
          title: "Commencez votre préparation",
          subtitle: "Première étape : une session QCM dans votre faculté.",
          primaryLabel: "Commencer une session",
          primaryHref: "/qcm",
        };

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} nav={HEADER_NAV} menuLinks={[
        { href: "/profile", label: "Mon profil" },
        { href: "/settings", label: "Paramètres" },
      ]} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-card-padding py-section-gap">
        <div className="grid gap-section-gap lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-section-gap">
            {/* 1. Resume bar — top, before everything else */}
            <ResumeBar
              title={resumeBar.title}
              subtitle={resumeBar.subtitle}
              meta={resumeBar.meta}
              metaLoading={!activeSession && hasAnyActivity && dueReviews.isLoading}
              primaryLabel={resumeBar.primaryLabel}
              primaryHref={resumeBar.primaryHref}
            />

            {/* 2. Hero / welcome */}
            <ProfileHero
              greeting={`Bonjour, ${firstName(user.fullName)}`}
              score={readinessData ? readinessData.score : null}
              scoreLabel={readinessData ? readinessLabelFr(readinessData.label) : null}
              insufficientData={readiness.data?.insufficientData ?? true}
              emptyMessage={
                hasAnyActivity
                  ? `Pas encore assez de réponses notées pour estimer votre préparation (minimum ${readiness.data?.minAttemptsRequired ?? 3} essais QCM/QCS).`
                  : "Lancez votre première session QCM pour débloquer votre score de préparation à l'examen."
              }
              loading={readiness.isLoading}
              error={readiness.error}
              onRetry={retryReadiness}
            />

            {/* 3. KPI row — max 3 */}
            <section aria-label="Indicateurs clés" className="grid grid-cols-2 gap-card-gap md:grid-cols-3">
              <MetricCard
                label="Jours de série"
                value={progress.data?.streak.currentStreakDays ?? 0}
                loading={progress.isLoading}
                error={progress.error ? "Série indisponible" : null}
                onRetry={retryReadiness}
                tone="primary"
              />
              <MetricCard
                label={
                  progress.data?.accuracy === null || progress.data?.accuracy === undefined
                    ? "Pas encore de notes"
                    : "Précision"
                }
                value={
                  progress.data?.accuracy === null || progress.data?.accuracy === undefined ? "—" : `${progress.data.accuracy}%`
                }
                loading={progress.isLoading}
                error={progress.error ? "Précision indisponible" : null}
                onRetry={retryReadiness}
                tone="suivi"
              />
              <MetricCard
                className="col-span-2 md:col-span-1"
                label={readinessData ? readinessLabelFr(readinessData.label) : "Préparation à venir"}
                value={readinessData ? readinessData.score : "—"}
                loading={readiness.isLoading}
                error={readiness.error}
                onRetry={retryReadiness}
                tone={readinessData ? readinessTone(readinessData.label) : "neutral"}
              />
            </section>

            {/* 4. Study-space nav */}
            <section aria-label="Espace d'étude">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-h2 font-semibold text-text-primary">Espace d&apos;étude</h2>
                <PrimaryTabs
                  tabs={STUDY_TABS}
                  activeId="qcm"
                  onChange={handleStudyTab}
                  ariaLabel="Domaines d'étude"
                />
              </div>
            </section>

            {/* 5. Recent activity */}
            <section id="activite" aria-label="Activité récente">
              <h2 className="mb-3 font-display text-h2 font-semibold text-text-primary">Activité récente</h2>
              <WeeklyActivity
                items={recentItems.map((item, index) => {
                  const { title, subtitle, href } = formatActivity(item);
                  return {
                    key: `${item.type}-${index}`,
                    href,
                    title,
                    subtitle,
                    timestamp: formatDate(item.at),
                  };
                })}
                loading={progress.isLoading}
                error={progress.error ? `Impossible de charger l&apos;activité. ${progress.error}` : null}
                onRetry={retryReadiness}
                emptyTitle="Aucune activité pour l'instant"
                emptyDescription="Lancez une session QCM pour commencer."
                emptyAction={{ label: "Créer une session QCM", href: "/qcm" }}
              />
            </section>
          </div>

          {/* Secondary column */}
          <aside className="flex flex-col gap-card-gap lg:sticky lg:top-6">
            {/* Credits */}
            <article
              className={[
                "rounded-card border bg-surface-1 p-card-padding shadow-card",
                credits.data && credits.data.remainingToday === 0
                  ? "border-danger"
                  : credits.data && isCreditsLow(credits.data)
                    ? "border-warning"
                    : "border-border",
              ].join(" ")}
            >
              <p className="text-meta font-medium uppercase tracking-wide text-text-secondary">Crédits IA</p>
              {credits.isLoading && <LoadingSkeleton className="mt-2 h-8 w-24" ariaLabel="Chargement des crédits" />}
              {!credits.isLoading && credits.error && (
                <div className="mt-2">
                  <p className="text-body text-danger">Solde indisponible. {credits.error}</p>
                  <button
                    type="button"
                    onClick={retryReadiness}
                    className="mt-2 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border bg-surface-1 px-3 text-meta font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
                  >
                    Réessayer
                  </button>
                </div>
              )}
              {!credits.isLoading && !credits.error && credits.data && credits.data.remainingToday === 0 && (
                <div className="mt-2">
                  <p className="font-display text-h3 font-semibold text-danger">0 crédit restant</p>
                  <p className="mt-1 text-meta text-text-secondary">
                    Quota du jour épuisé ({credits.data.dailyAllowance}/jour). Réinitialisation :{" "}
                    {new Date(credits.data.resetAt).toLocaleString("fr-DZ", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    .
                  </p>
                  <Link
                    href="/subscription"
                    className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control bg-danger px-3 text-meta font-medium text-background transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    Recharger
                  </Link>
                </div>
              )}
              {!credits.isLoading && !credits.error && credits.data && credits.data.remainingToday > 0 && (
                <div className="mt-2">
                  <p
                    className={[
                      "font-display text-h3 font-semibold",
                      isCreditsLow(credits.data) ? "text-warning" : "text-text-primary",
                    ].join(" ")}
                  >
                    {credits.data.remainingToday}
                    <span className="ml-1 text-meta font-medium text-text-secondary">
                      / {credits.data.dailyAllowance} restants
                    </span>
                  </p>
                  {isCreditsLow(credits.data) && (
                    <p className="mt-1 text-meta text-warning">Solde bas — économisez vos indices pour aujourd&apos;hui.</p>
                  )}
                  <p className="mt-1 text-meta text-text-tertiary">
                    Reset {new Date(credits.data.resetAt).toLocaleString("fr-DZ", { timeStyle: "short", dateStyle: "short" })}
                  </p>
                </div>
              )}
            </article>

            {/* Subscription */}
            <PremiumCard
              status={
                subscription.isLoading
                  ? "loading"
                  : subscription.error
                    ? "error"
                    : !currentSubscription
                      ? "free"
                      : currentSubscription.cancelledAt && !currentSubscription.autoRenew
                        ? "cancelled"
                        : "active"
              }
              planName={currentSubscription?.plan.name}
              priceLabel={subscriptionPrice}
              renewsAt={currentSubscription ? formatDateShort(currentSubscription.currentPeriodEnd) : undefined}
              cancelsAt={currentSubscription?.cancelledAt ? formatDateShort(currentSubscription.currentPeriodEnd) : undefined}
              error={subscription.error}
              onRetry={subscription.refetch}
              upgradeHref="/subscription"
            />

            {/* Social / friends */}
            <FriendsPanel
              friends={(friends.data?.friends ?? []).map((friend) => ({
                id: friend.id,
                name: friend.fullName,
              }))}
              loading={friends.isLoading}
              error={friends.error ? `Impossible de charger vos amis. ${friends.error}` : null}
              onRetry={friends.refetch}
              emptyTitle="Pas encore d'amis"
              emptyDescription="Invitez des camarades pour comparer vos scores et rester motivé."
              emptyAction={{
                label: "Voir mon activité",
                onClick: () => document.getElementById("activite")?.scrollIntoView({ behavior: "smooth" }),
              }}
            />

            {/* Resources */}
            <article className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
              <p className="text-meta font-medium uppercase tracking-wide text-text-secondary">Ressources</p>
              <ul className="mt-2 flex flex-col gap-2">
                <li>
                  <Link
                    href="/subscription"
                    className="inline-flex min-h-touch-target items-center text-body font-medium text-accent-suivi transition hover:text-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    Abonnement
                  </Link>
                </li>
                <li>
                  <Link
                    href="/settings"
                    className="inline-flex min-h-touch-target items-center text-body font-medium text-accent-suivi transition hover:text-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    Notifications
                  </Link>
                </li>
                <li>
                  <Link
                    href="/notes"
                    className="inline-flex min-h-touch-target items-center text-body font-medium text-accent-suivi transition hover:text-accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    Mes notes
                  </Link>
                </li>
              </ul>
            </article>
          </aside>
        </div>
      </main>

      <Footer />
    </>
  );
}
