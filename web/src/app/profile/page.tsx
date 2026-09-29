"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, BadgeShelf, EmptyState, Footer, MetricCard } from "@/components";
import type { EarnedBadge } from "@/components";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import type {
  ExamReadiness,
  FriendSummary,
  ProgressSummary,
  QcmStats,
  Subscription,
} from "@/lib/types";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function subscriptionStatusLabel(
  sub: Subscription | null,
  t: (key: "profile.free" | "profile.cancelled") => string
): string {
  if (!sub) return t("profile.free");
  if (sub.status === "active") return sub.plan.name;
  if (sub.status === "cancelled") return t("profile.cancelled");
  return sub.status;
}

/**
 * P16 cohort-rank chip for the metrics row. Reads the same Phase 3 leaderboard
 * snapshots as /classement (score board, viewer's own cohort) and matches the
 * viewer's row by display name — the response carries no user ids by design.
 * Renders "—" while loading, on error, or when unranked: never an error card.
 */
function RankMetricCard({ facultyId, yearId, fullName }: { facultyId: string; yearId: string; fullName: string }) {
  const board = useApiResource<{ leaderboard: { rank: number; score: number; fullName: string }[] }>(
    `/leaderboard?facultyId=${facultyId}&yearId=${yearId}`
  );
  const rank = useMemo(
    () => board.data?.leaderboard.find((row) => row.fullName === fullName)?.rank ?? null,
    [board.data, fullName]
  );
  const { t } = useLanguage();
  return (
    <MetricCard
      label={t("nav.leaderboard")}
      value={rank !== null ? `#${rank}` : "—"}
      subtitle={t("profile.cohort")}
      loading={board.isLoading}
      tone="primary"
    />
  );
}

export default function ProfilePage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { user, isHydrated } = useRequireAuth();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;

  const streak = useApiResource<{ streak: { currentStreakDays: number; longestStreakDays: number } }>(
    canFetch ? "/streaks/me" : null
  );
  const progress = useApiResource<ProgressSummary>(canFetch ? "/progress/me" : null);
  const qcmStats = useApiResource<QcmStats>(canFetch ? "/progress/qcm-stats" : null);
  const badgesData = useApiResource<{ badges: EarnedBadge[] }>(canFetch ? "/badges/me" : null);
  const readiness = useApiResource<ExamReadiness>(canFetch ? "/progress/readiness" : null);
  const friendsData = useApiResource<{ friends: FriendSummary[] }>(canFetch ? "/friends" : null);
  const subscription = useApiResource<{ subscription: Subscription | null }>(canFetch ? "/subscriptions/me" : null);

  const facultyData = useApiResource<{ faculties: { id: string; name: string }[] }>(
    canFetch ? "/faculties" : null
  );
  const facultyName = useMemo(() => {
    if (!user?.facultyId || !facultyData.data) return null;
    return facultyData.data.faculties.find((f) => f.id === user.facultyId)?.name ?? null;
  }, [user, facultyData]);

  const yearData = useApiResource<{ years: { id: string; label: string }[] }>(
    canFetch && user?.facultyId ? `/faculties/${user.facultyId}/years` : null
  );
  const yearLabel = useMemo(() => {
    if (!user?.yearId || !yearData.data) return null;
    return yearData.data.years.find((y) => y.id === user.yearId)?.label ?? null;
  }, [user, yearData]);

  const [friendSearch, setFriendSearch] = useState("");
  const friends = useMemo(() => friendsData.data?.friends ?? [], [friendsData.data]);  const filteredFriends = useMemo(() => {
    if (!friendSearch.trim()) return friends;
    const q = friendSearch.toLowerCase();
    return friends.filter((f) => f.fullName.toLowerCase().includes(q));
  }, [friends, friendSearch]);

  // Find-new-friends search (GET /api/users/search — id+fullName only, min 3
  // chars server-side). Results carry per-row send state, keyed by user id.
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<FriendSummary[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const [userSearchError, setUserSearchError] = useState<string | null>(null);
  const [userSearched, setUserSearched] = useState(false);
  const [sentRequests, setSentRequests] = useState<Record<string, boolean>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  async function handleUserSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = userQuery.trim();
    if (query.length < 3) {
      setUserSearchError(t("profile.queryShort"));
      return;
    }
    setUserSearching(true);
    setUserSearchError(null);
    try {
      const data = await apiFetch<{ users: FriendSummary[] }>(
        `/users/search?q=${encodeURIComponent(query)}`
      );
      setUserResults(data.users);
      setUserSearched(true);
    } catch (err) {
      setUserSearchError(err instanceof ApiError ? err.message : t("profile.searchFailed"));
    } finally {
      setUserSearching(false);
    }
  }

  async function handleSendRequest(targetId: string) {
    setSendingId(targetId);
    try {
      await apiFetch("/friends", {
        method: "POST",
        body: JSON.stringify({ userId: targetId }),
      });
      // 200 (already pending) and 201 (created) both mean a request now exists.
      setSentRequests((prev) => ({ ...prev, [targetId]: true }));
    } catch {
      // Row-level failure: the button simply stays actionable. A global banner
      // would punish the whole section for one row's failed POST.
    } finally {
      setSendingId(null);
    }
  }

  const readinessData = readiness.data && !readiness.data.insufficientData ? readiness.data : null;

  // Overall accuracy straight from the qcm-stats counts (graded attempts only —
  // correctCount + incorrectCount excludes ungraded QROC rows by construction).
  const gradedCount = (qcmStats.data?.correctCount ?? 0) + (qcmStats.data?.incorrectCount ?? 0);
  const overallAccuracy =
    qcmStats.data && gradedCount > 0 ? Math.round((qcmStats.data.correctCount / gradedCount) * 100) : null;

  function formatDuration(seconds: number): string {
    if (seconds <= 0) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m} min ${s.toString().padStart(2, "0")}s` : `${s}s`;
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <p className="text-meta text-text-secondary">{t("common.loadingMore")}</p>
      </main>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-card-padding py-section-gap">
        {/* Hero — one card: cover band + overlapping avatar + identity.
            A3-REDO preview (profile hero only): band mirrors MedSparkDZ's
            measured 96px cover using the approved Blue→Violet stops; avatar
            pulled up to overlap it. Decorative band is aria-hidden. */}
        <section aria-label={t("profile.aria")} className="overflow-hidden rounded-card-lg bg-surface-1 shadow-card">
          <div
            aria-hidden
            className="h-24"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--color-accent-primary), var(--color-accent-library), var(--color-accent-secondary))",
            }}
          />
          <div className="flex flex-col items-center gap-6 p-card-padding sm:flex-row sm:items-start">
          {/* Avatar + identity (avatar overlaps the band above) */}
          <div className="-mt-14 flex flex-col items-center gap-3 sm:items-start">
            <span className="flex h-20 w-20 items-center justify-center rounded-pill bg-accent-primary font-display text-h1 font-bold text-on-accent">
              {initials(user.fullName)}
            </span>
            <div className="text-center sm:text-left">
              <h1 className="font-display text-h2 font-bold text-text-primary sm:text-h1">{user.fullName}</h1>
              {user.email ? <p className="mt-0.5 text-meta text-text-secondary">{user.email}</p> : null}
              {user.phone ? <p className="mt-0.5 text-meta text-text-tertiary">{user.phone}</p> : null}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {facultyName ? (
                    <span className="rounded-pill border border-accent-library/40 bg-accent-library/15 px-2.5 py-0.5 text-caption font-medium text-accent-soft">
                    {facultyName}
                  </span>
                ) : null}
                {yearLabel ? (
                    <span className="rounded-pill border border-accent-suivi/40 bg-accent-suivi/15 px-2.5 py-0.5 text-caption font-medium text-accent-soft">
                    {yearLabel}
                  </span>
                ) : null}
                {user.wilaya ? (
                  <span className="rounded-pill border border-border bg-surface-3 px-2.5 py-0.5 text-caption font-medium text-text-secondary">
                    {user.wilaya}
                  </span>
                ) : null}
                <span className="rounded-pill border border-border bg-surface-3 px-2.5 py-0.5 text-caption font-medium text-text-secondary">
                  {subscriptionStatusLabel(subscription.data?.subscription ?? null, t)}
                </span>
              </div>
            </div>
          </div>

          {/* Metrics row */}
          <div className="grid w-full grid-cols-2 gap-3 sm:ml-auto sm:w-auto sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard
              label={t("profile.streak")}
              value={streak.data?.streak.currentStreakDays ?? 0}
              subtitle={t("profile.streakBest", { n: streak.data?.streak.longestStreakDays ?? 0 })}
              loading={streak.isLoading}
              tone="primary"
            />
            <MetricCard
              label={t("suivi.accuracy")}
              value={overallAccuracy !== null ? `${overallAccuracy}%` : "—"}
              subtitle={t("suivi.accuracySubtitle")}
              loading={qcmStats.isLoading}
              tone="suivi"
            />
            <MetricCard
              label={t("suivi.avgScore")}
              value={
                progress.data?.averageScore !== null && progress.data?.averageScore !== undefined
                  ? `${progress.data.averageScore}%`
                  : "—"
              }
              subtitle={t("suivi.avgScoreSubtitle")}
              loading={progress.isLoading}
              tone="qcm"
            />
            <MetricCard
              label={t("profile.readiness")}
              value={readinessData ? readinessData.score : "—"}
              subtitle="/100"
              loading={readiness.isLoading}
              tone={readinessData && readinessData.score !== null && readinessData.score >= 70 ? "success" : "primary"}
            />
            {/* P16 rank colocation: cohort rank beside the other headline stats.
                Skipped silently when the profile has no faculty/year (same
                graceful-omit convention as the faculty/year pills above). */}
            {user.facultyId && user.yearId ? (
              <RankMetricCard facultyId={user.facultyId} yearId={user.yearId} fullName={user.fullName} />
            ) : null}
          </div>
          </div>
        </section>

        {/* Friends section */}
        <section aria-label={t("profile.friends")} className="mt-section-gap">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("profile.friends")}</h2>
            {friends.length > 0 && (
              <div className="relative">
                <input
                  type="search"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder={t("profile.searchFriendPh")}
                  aria-label={t("profile.searchFriend")}
                  className="h-10 w-full rounded-control border border-border bg-surface-2 px-3 pr-8 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                />
                <svg viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="9" cy="9" r="6" />
                  <path d="M13.5 13.5L17 17" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>

          {friendsData.isLoading ? (
            <div className="mt-3 flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <LoadingSkeleton key={i} className="h-14 w-full rounded-card" />
              ))}
            </div>
          ) : friendsData.error ? (
            <p role="alert" className="mt-3 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
              {friendsData.error}
            </p>
          ) : friends.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title={t("dashboard.noFriends")}
                description={t("profile.noFriendsDesc")}
                action={{ label: t("classement.backToDashboard"), href: "/dashboard" }}
              />
            </div>
          ) : filteredFriends.length === 0 ? (
            <p className="mt-3 text-meta text-text-tertiary">{t("profile.noMatchFriends", { q: friendSearch })}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1">
              {filteredFriends.map((friend) => (
                <li
                  key={friend.id}
                  className="flex min-h-touch-target items-center gap-3 rounded-card border border-border bg-surface-1 px-3 py-2 shadow-card transition hover:border-border-strong hover:bg-surface-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-3 font-display text-caption font-bold text-accent-soft" aria-hidden>
                    {initials(friend.fullName)}
                  </span>
                  <p className="truncate text-body font-medium text-text-primary">{friend.fullName}</p>
                </li>
              ))}
            </ul>
          )}

          {/* Find new friends: server search (id + name only) + request */}
          <form onSubmit={handleUserSearch} className="mt-4 rounded-card border border-border bg-surface-1 p-3">
            <label htmlFor="find-friends" className="block text-body font-medium text-text-primary">
              {t("profile.addFriend")}
            </label>
            <p className="mt-0.5 text-meta text-text-tertiary">
              {t("profile.findHint")}
            </p>
            <div className="mt-2 flex gap-2">
              <input
                id="find-friends"
                type="search"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder={t("profile.findPlaceholder")}
                aria-label={t("profile.findAria")}
                className="h-11 min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-3 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              />
              <button
                type="submit"
                disabled={userSearching}
                className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-control bg-accent-qcm px-4 text-body font-medium text-on-accent transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
              >
                {userSearching ? "…" : t("profile.search")}
              </button>
            </div>
            {userSearchError ? (
              <p role="alert" className="mt-2 text-meta text-danger">
                {userSearchError}
              </p>
            ) : null}
            {userSearched && !userSearching && !userSearchError ? (
              userResults.length === 0 ? (
                <p className="mt-2 text-meta text-text-tertiary">{t("profile.noUsers")}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {userResults.map((result) => (
                    <li
                      key={result.id}
                      className="flex min-h-touch-target items-center gap-3 rounded-control border border-border bg-surface-2 px-3 py-2"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-surface-3 font-display text-caption font-bold text-accent-soft" aria-hidden>
                        {initials(result.fullName)}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">
                        {result.fullName}
                      </p>
                      {sentRequests[result.id] ? (
                        <span className="shrink-0 text-meta font-medium text-success">{t("profile.requestSent")}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendRequest(result.id)}
                          disabled={sendingId === result.id}
                          className="inline-flex min-h-touch-target shrink-0 items-center justify-center rounded-control border border-border px-3 text-meta font-medium text-text-primary transition hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-60"
                        >
                          {sendingId === result.id ? "…" : t("profile.add")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </form>
        </section>

        <BadgeShelf badges={badgesData.data?.badges ?? []} loading={badgesData.isLoading} />

        {/* QCM Stats */}
        <section aria-label={t("profile.qcmStats")} className="mt-section-gap">
          <h2 className="font-display text-h2 font-semibold text-text-primary">{t("profile.qcmStats")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <MetricCard
              label={t("suivi.sessionsDone")}
              value={qcmStats.data?.sessionsCompleted ?? 0}
              subtitle={t("common.total")}
              loading={qcmStats.isLoading}
              tone="qcm"
            />
            <MetricCard
              label={t("suivi.accuracy")}
              value={overallAccuracy !== null ? `${overallAccuracy}%` : "—"}
              subtitle={t("profile.goodAnswers", { c: qcmStats.data?.correctCount ?? 0, g: gradedCount })}
              loading={qcmStats.isLoading}
              tone="suivi"
            />
            <MetricCard
              label={t("suivi.avgScore")}
              value={
                progress.data?.averageScore !== null && progress.data?.averageScore !== undefined
                  ? `${progress.data.averageScore}%`
                  : "—"
              }
              subtitle={t("profile.perSession")}
              loading={progress.isLoading}
              tone="qcm"
            />
            <MetricCard
              label={t("suivi.recentAccuracy")}
              value={
                qcmStats.data?.accuracyRecent20 !== null && qcmStats.data?.accuracyRecent20 !== undefined
                  ? `${qcmStats.data.accuracyRecent20}%`
                  : "—"
              }
              subtitle={t("profile.last20")}
              loading={qcmStats.isLoading}
              tone="primary"
            />
            <MetricCard
              label={t("profile.mockExams")}
              value={qcmStats.data?.mockExamsCompleted ?? 0}
              subtitle={t("profile.completed")}
              loading={qcmStats.isLoading}
              tone="qcm"
            />
            <MetricCard
              label={t("profile.avgDuration")}
              value={
                qcmStats.data && qcmStats.data.averageSessionDurationSeconds > 0
                  ? formatDuration(qcmStats.data.averageSessionDurationSeconds)
                  : "—"
              }
              subtitle={`max ${qcmStats.data ? formatDuration(qcmStats.data.longestSessionDurationSeconds) : "—"}`}
              loading={qcmStats.isLoading}
              tone="suivi"
            />
            <MetricCard
              label={t("profile.coverage")}
              value={
                readinessData
                  ? `${readinessData.components.curriculumCoverage}%`
                  : "—"
              }
              subtitle={t("profile.lessonsViewed")}
              loading={readiness.isLoading}
              tone="library"
            />
            <MetricCard
              label={t("profile.recordStreak")}
              value={qcmStats.data?.streakRecord ?? 0}
              subtitle={t("profile.streakDays")}
              loading={qcmStats.isLoading}
              tone="success"
            />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
