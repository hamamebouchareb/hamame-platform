"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, readinessLabel, type UiLanguage } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import {
  ActivationCodeCard,
  AppHeader,
  Footer,
  FriendsPanel,
  LoadingSkeleton,
  MetricCard,
  PremiumCard,
  PrimaryTabs,
  ProfileHero,
  ResumeBar,
  VerifyEmailBanner,
  WeeklyActivity,
} from "@/components";
import { Sidebar } from "@/components/layout/Sidebar";
import type {
  AiCredits,
  ExamReadiness,
  FriendSummary,
  ProgressSummary,
  RecentActivityItem,
  Subscription,
} from "@/lib/types";

// Study-space navigation — the four Hamame pillars (labels resolve via nav.* keys).
const STUDY_TABS = [
  { id: "qcm", labelKey: "nav.qcm" },
  { id: "bibliotheque", labelKey: "nav.library" },
  { id: "suivi", labelKey: "nav.progress" },
  { id: "revision", labelKey: "nav.revision" },
] as const;

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

function formatActivity(
  item: RecentActivityItem,
  t: (key: "dashboard.unscored" | "dashboard.sessionPractice" | "dashboard.sessionExam" | "dashboard.lessonViewed") => string
): { title: string; subtitle: string; href: string } {
  if (item.type === "session") {
    const scoreLabel = item.score === null ? t("dashboard.unscored") : `${item.score}%`;
    return {
      title: item.name,
      subtitle: `${item.mode === "practice" ? t("dashboard.sessionPractice") : t("dashboard.sessionExam")} · ${scoreLabel}`,
      href: `/sessions/${item.id}/results`,
    };
  }
  return {
    title: item.title,
    subtitle: t("dashboard.lessonViewed"),
    href: `/lessons/${item.lessonId}`,
  };
}

function formatDate(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleString(localeFor(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateShort(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleDateString(localeFor(lang), { dateStyle: "medium" });
}

export default function DashboardPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();
  const { lang, t } = useLanguage();
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
        <p className="text-meta text-text-secondary">{t("common.loadingMore")}</p>
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
      ? `${currentSubscription.plan.priceDzd.toLocaleString(localeFor(lang))} DZD${
          currentSubscription.plan.billingPeriod === "yearly"
            ? t("dashboard.billingYearly")
            : currentSubscription.plan.billingPeriod === "monthly"
              ? t("dashboard.billingMonthly")
              : ""
        }`
      : undefined;

  const resumeBar = activeSession
    ? {
        title: t("dashboard.resumeActiveTitle", { name: activeSession.name }),
        subtitle: t("dashboard.resumeActiveSub"),
        meta: t("dashboard.inProgress"),
        primaryLabel: t("dashboard.resume"),
        primaryHref: `/sessions/${activeSession.id}`,
      }
    : hasAnyActivity
      ? {
          title: t("dashboard.continueTitle"),
          subtitle:
            dueReviewCount > 0
              ? t("dashboard.reviewsWaiting")
              : t("dashboard.keepStreak"),
          meta: dueReviewCount > 0 ? t(dueReviewCount === 1 ? "dashboard.dueOne" : "dashboard.dueMany", { count: dueReviewCount }) : undefined,
          primaryLabel: t("dashboard.resume"),
          primaryHref: "/qcm",
        }
      : {
          title: t("dashboard.startTitle"),
          subtitle: t("dashboard.startSubtitle"),
          primaryLabel: t("dashboard.startCta"),
          primaryHref: "/qcm",
        };

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <div className="mx-auto flex w-full max-w-6xl flex-1 items-start gap-section-gap px-card-padding">
        <Sidebar />

        <main className="min-w-0 flex-1 py-section-gap">
        <div className="grid gap-section-gap lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-section-gap">
            {/* 0. Email-verification nudge (warn-only: renders nothing when verified) */}
            <VerifyEmailBanner />

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
              greeting={t("dashboard.greeting", { name: firstName(user.fullName) })}
              score={readinessData ? readinessData.score : null}
              scoreLabel={readinessData ? readinessLabel(lang, readinessData.label) : null}
              insufficientData={readiness.data?.insufficientData ?? true}
              emptyMessage={
                hasAnyActivity
                  ? t("dashboard.emptyActive", { min: readiness.data?.minAttemptsRequired ?? 3 })
                  : t("dashboard.emptyNew")
              }
              loading={readiness.isLoading}
              error={readiness.error}
              onRetry={retryReadiness}
            />

            {/* 3. KPI row — max 3 */}
            <section aria-label={t("dashboard.kpiAria")} className="grid grid-cols-2 gap-card-gap md:grid-cols-3">
              <MetricCard
                label={t("dashboard.streakDays")}
                value={progress.data?.streak.currentStreakDays ?? 0}
                loading={progress.isLoading}
                error={progress.error ? t("dashboard.streakError") : null}
                onRetry={retryReadiness}
                tone="primary"
              />
              <MetricCard
                label={
                  progress.data?.accuracy === null || progress.data?.accuracy === undefined
                    ? t("dashboard.noGrades")
                    : t("dashboard.accuracy")
                }
                value={
                  progress.data?.accuracy === null || progress.data?.accuracy === undefined ? "—" : `${progress.data.accuracy}%`
                }
                loading={progress.isLoading}
                error={progress.error ? t("dashboard.accuracyError") : null}
                onRetry={retryReadiness}
                tone="suivi"
              />
              <MetricCard
                className="col-span-2 md:col-span-1"
                label={readinessData ? readinessLabel(lang, readinessData.label) : t("dashboard.upcomingPrep")}
                value={readinessData ? readinessData.score : "—"}
                loading={readiness.isLoading}
                error={readiness.error}
                onRetry={retryReadiness}
                tone={readinessData ? readinessTone(readinessData.label) : "neutral"}
              />
            </section>

            {/* 4. Study-space nav */}
            <section aria-label={t("dashboard.studySpace")}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-h2 font-semibold text-text-primary">{t("dashboard.studySpace")}</h2>
                <PrimaryTabs
                  tabs={STUDY_TABS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
                  activeId="qcm"
                  onChange={handleStudyTab}
                  ariaLabel={t("dashboard.studyFields")}
                />
              </div>
            </section>

            {/* 5. Recent activity */}
            <section id="activite" aria-label={t("dashboard.recentActivity")}>
              <h2 className="mb-3 font-display text-h2 font-semibold text-text-primary">{t("dashboard.recentActivity")}</h2>
              <WeeklyActivity
                items={recentItems.map((item, index) => {
                  const { title, subtitle, href } = formatActivity(item, t);
                  return {
                    key: `${item.type}-${index}`,
                    href,
                    title,
                    subtitle,
                    timestamp: formatDate(item.at, lang),
                  };
                })}
                loading={progress.isLoading}
                error={progress.error ? t("dashboard.activityError", { error: progress.error }) : null}
                onRetry={retryReadiness}
                emptyTitle={t("dashboard.noActivityTitle")}
                emptyDescription={t("dashboard.noActivityDesc")}
                emptyAction={{ label: t("dashboard.createQcm"), href: "/qcm" }}
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
                  : credits.data && credits.data.lowBalance
                    ? "border-warning"
                    : "border-border",
              ].join(" ")}
            >
              <p className="text-meta font-medium uppercase tracking-wide text-text-secondary">{t("dashboard.credits")}</p>
              {credits.isLoading && <LoadingSkeleton className="mt-2 h-8 w-24" ariaLabel={t("dashboard.creditsLoading")} />}
              {!credits.isLoading && credits.error && (
                <div className="mt-2">
                  <p className="text-body text-danger">{t("dashboard.balanceError", { error: credits.error })}</p>
                  <button
                    type="button"
                    onClick={retryReadiness}
                    className="mt-2 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border bg-surface-1 px-3 text-meta font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
                  >
                    {t("common.retry")}
                  </button>
                </div>
              )}
              {!credits.isLoading && !credits.error && credits.data && credits.data.remainingToday === 0 && (
                <div className="mt-2">
                  <p className="font-display text-h3 font-semibold text-danger">{t("dashboard.noCredit")}</p>
                  <p className="mt-1 text-meta text-text-secondary">
                    {t("dashboard.quotaOut", {
                      allowance: credits.data.dailyAllowance,
                      date: new Date(credits.data.resetAt).toLocaleString(localeFor(lang), {
                        dateStyle: "short",
                        timeStyle: "short",
                      }),
                    })}
                  </p>
                  <Link
                    href="/subscription"
                    className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control bg-danger px-3 text-meta font-medium text-background transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    {t("dashboard.recharge")}
                  </Link>
                </div>
              )}
              {!credits.isLoading && !credits.error && credits.data && credits.data.remainingToday > 0 && (
                <div className="mt-2">
                  <p
                    className={[
                      "font-display text-h3 font-semibold",
                      credits.data.lowBalance ? "text-warning" : "text-text-primary",
                    ].join(" ")}
                  >
                    {credits.data.remainingToday}
                    <span className="ml-1 text-meta font-medium text-text-secondary">
                      {t("dashboard.remaining", { allowance: credits.data.dailyAllowance })}
                    </span>
                  </p>
                  {credits.data.lowBalance && (
                    <p className="mt-1 text-meta text-warning">{t("dashboard.lowBalance")}</p>
                  )}
                  <p className="mt-1 text-meta text-text-tertiary">
                    {t("dashboard.resetAt", {
                      date: new Date(credits.data.resetAt).toLocaleString(localeFor(lang), { timeStyle: "short", dateStyle: "short" }),
                    })}
                  </p>
                </div>
              )}
            </article>

            {/* Révision dues (Phase 4) — small widget over GET /reviews/due.
                No efficacy stat exists anywhere (verified: no such field in the
                endpoint, jobs, or ReviewSettings), so the widget shows the due
                count only — it does not invent one. */}
            <article
              aria-label={t("dashboard.dueTitle")}
              className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card"
            >
              <p className="text-meta font-medium uppercase tracking-wide text-text-secondary">
                {t("dashboard.dueTitle")}
              </p>
              {dueReviews.isLoading && dueReviewCount === 0 ? (
                <LoadingSkeleton className="mt-2 h-8 w-24" ariaLabel={t("dashboard.dueLoading")} />
              ) : dueReviews.error ? (
                <div className="mt-2">
                  <p className="text-body text-danger">{t("dashboard.dueError", { error: dueReviews.error })}</p>
                  <button
                    type="button"
                    onClick={dueReviews.refetch}
                    className="mt-2 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border bg-surface-1 px-3 text-meta font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
                  >
                    {t("common.retry")}
                  </button>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="font-display text-h3 font-semibold text-text-primary">
                    {dueReviewCount}{" "}
                    <span className="ml-1 text-meta font-medium text-text-secondary">
                      {t(dueReviewCount === 1 ? "dashboard.dueOne" : "dashboard.dueMany", { count: dueReviewCount })}
                    </span>
                  </p>
                  <p className="mt-1 text-meta text-text-tertiary">
                    {dueReviewCount === 0
                      ? t("dashboard.upToDate")
                      : t("dashboard.spacedQueue")}
                  </p>
                  <Link
                    href="/revision"
                    className="mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-meta font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    {dueReviewCount === 0 ? t("dashboard.openReviews") : t("dashboard.reviewNow")}
                  </Link>
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
              renewsAt={currentSubscription ? formatDateShort(currentSubscription.currentPeriodEnd, lang) : undefined}
              cancelsAt={currentSubscription?.cancelledAt ? formatDateShort(currentSubscription.currentPeriodEnd, lang) : undefined}
              error={subscription.error}
              onRetry={subscription.refetch}
              upgradeHref="/subscription"
            />

            {/* Activation code (FR-65/BR-18) — the manual-payment redemption path,
                shown next to the upgrade prompt it is an alternative to. */}
            {!currentSubscription || currentSubscription.cancelledAt ? (
              <ActivationCodeCard onRedeemed={subscription.refetch} />
            ) : null}

            {/* Social / friends */}
            <FriendsPanel
              friends={(friends.data?.friends ?? []).map((friend) => ({
                id: friend.id,
                name: friend.fullName,
              }))}
              loading={friends.isLoading}
              error={friends.error ? t("dashboard.friendsError", { error: friends.error }) : null}
              onRetry={friends.refetch}
              emptyTitle={t("dashboard.noFriends")}
              emptyDescription={t("dashboard.noFriendsDesc")}
              emptyAction={{
                label: t("dashboard.viewActivity"),
                onClick: () => document.getElementById("activite")?.scrollIntoView({ behavior: "smooth" }),
              }}
            />

            {/* Resources */}
            <article className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
              <p className="text-meta font-medium uppercase tracking-wide text-text-secondary">{t("dashboard.resources")}</p>
              <Link
                href="/resources"
                className="inline-flex min-h-touch-target items-center text-body font-medium text-accent-soft transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                {t("dashboard.allResources")}
              </Link>
            </article>
          </aside>
        </div>
        </main>
      </div>

      <Footer />
    </>
  );
}
