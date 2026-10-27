"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { apiFetch, ApiError } from "@/lib/api";
import { EmptyState, LoadingSkeleton, MetricCard, PageShell } from "@/components";
import type { FriendProfile } from "@/lib/types";

// Param hygiene: a malformed id never reaches the API — it resolves to the
// same "not found" state as an unknown UUID (the server would 400 it, but a
// bogus link should fail client-side without a round-trip).
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Failure modes carry their OWN typed copy (fr/en), keyed off the API's error
// vocabulary — the same convention as every other error state driven by ApiError.
type FriendProfileFailure = "notFriends" | "notFound" | "network" | null;

/**
 * /amis/[id] — a FRIEND's public profile with their progress. Linked from the
 * dashboard's FriendsPanel and the profile page's friends list. Data comes
 * from GET /api/users/:id/profile, which is friend-gated server-side (403
 * NOT_FRIENDS unless an accepted friendship exists, 404 unknown/deleted) and
 * whose progress block is the EXACT /api/progress/me payload (the backend
 * builder is shared verbatim — one accuracy surface, see progress.routes.ts).
 */
export default function FriendProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t, lang } = useLanguage();

  const friendId = params.id;
  const friendIdValid = UUID_PATTERN.test(friendId);

  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [failure, setFailure] = useState<FriendProfileFailure>(null);
  const [loading, setLoading] = useState(true);
  // Network failures re-run the effect through this key (EmptyState always
  // renders a concrete action — "Retry" here).
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isHydrated || !user || !friendIdValid) return; // useAuthedPage redirects; invalid id short-circuits at render below
    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setFailure(null);
    (async () => {
      try {
        const data = await apiFetch<FriendProfile>(`/users/${friendId}/profile`);
        if (!cancelled) setProfile(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === "NOT_FRIENDS") {
          setFailure("notFriends");
        } else if (err instanceof ApiError && err.code === "USER_NOT_FOUND") {
          setFailure("notFound");
        } else {
          setFailure("network");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHydrated, user, friendId, friendIdValid, retryKey]);

  const invalidParam = isHydrated && user !== null && !friendIdValid;
  const showSkeleton = loading && failure === null && !invalidParam;
  const showNotFound = invalidParam || failure === "notFound";

  const name = profile?.user.fullName ?? "…";
  const isSelf = profile !== null && user !== null && profile.user.id === user.id;
  // Invalid URL param: resolved deterministically at render (no server call,
  // no extra state) — same page content as an unknown deleted/absent account.
  // Deliberately locale-formatted date (not a dictionary key): the friend's
  // member-since line is a DATE, same convention as other date-only display.
  const memberSince = profile
    ? new Date(profile.user.createdAt).toLocaleDateString(lang === "en" ? "en-GB" : "fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const recentActivity = profile?.progress.recentActivity.slice(0, 5) ?? [];

  const title = profile
    ? t("friendPage.title", { name })
    : invalidParam || failure === "notFound"
      ? t("friendPage.notFoundTitle")
      : failure === "notFriends"
        ? t("friendPage.notFriendsTitle")
        : failure === "network"
          ? t("friendPage.networkTitle")
          : "…";

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      kicker={t("profile.friends")}
      title={title}
      description={
        profile
          ? [profile.user.facultyName, profile.user.yearLabel].filter(Boolean).join(" · ") || undefined
          : undefined
      }
      actions={
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-3 text-meta font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {t("friendPage.back")}
        </button>
      }
    >
      {showSkeleton ? (
        <div className="flex flex-col gap-card-gap">
          <LoadingSkeleton className="h-24 w-full rounded-card" ariaLabel={t("common.loading")} />
          <LoadingSkeleton className="h-20 w-full rounded-card" />
          <LoadingSkeleton className="h-40 w-full rounded-card" />
        </div>
      ) : showNotFound ? (
        <div className="mt-section-gap">
          <EmptyState
            title={t("friendPage.notFoundTitle")}
            description={t("friendPage.notFoundDesc")}
            action={{ label: t("friendPage.back"), href: "/dashboard" }}
          />
        </div>
      ) : failure === "notFriends" ? (
        <div className="mt-section-gap">
          <EmptyState
            title={t("friendPage.notFriendsTitle")}
            description={t("friendPage.notFriendsDesc")}
            action={{ label: t("profile.addFriend"), href: "/profile" }}
          />
        </div>
      ) : failure === "network" ? (
        <div className="mt-section-gap">
          <EmptyState
            title={t("friendPage.networkTitle")}
            description={t("friendPage.networkDesc")}
            action={{ label: t("common.retry"), onClick: () => setRetryKey((key) => key + 1) }}
          />
        </div>
      ) : profile ? (
        <>
          {isSelf ? (
            <p className="mt-3 rounded-card border border-border bg-surface-1 px-3 py-2 text-meta text-text-secondary">
              {t("friendPage.selfBadge")}
            </p>
          ) : null}

          {/* Identity card — avatar + name + curriculum/wilaya line. */}
          <section aria-label={title} className="mt-section-gap">
            <div className="flex items-center gap-4 rounded-card-lg bg-surface-1 p-card-padding shadow-card">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-surface-3 font-display text-h2 font-bold text-accent-soft" aria-hidden>
                {profile.user.profilePhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.user.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(profile.user.fullName ?? "?")
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-h2 font-semibold text-text-primary">
                  {profile.user.fullName ?? "—"}
                </p>
                <p className="mt-1 text-meta text-text-secondary">
                  {memberSince ? `${t("friendPage.memberSince")} ${memberSince}` : "—"}
                </p>
                {profile.user.wilaya ? (
                  <p className="mt-0.5 text-meta text-text-tertiary">{profile.user.wilaya}</p>
                ) : null}
              </div>
            </div>
          </section>

          {/* Progress metrics — the /api/progress/me surface, verbatim. The
              accuracy hint (accuracySubtitle "QCM / QCS, au total") keeps the
              inherited caveat honest: this summary counts every attempt row. */}
          <section aria-label={t("suivi.metricsAria")} className="mt-section-gap">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard
                label={t("suivi.streakDays")}
                value={profile.progress.streak.currentStreakDays}
                subtitle={t("profile.streakBest", { n: profile.progress.streak.longestStreakDays })}
                tone="success"
              />
              <MetricCard
                label={t("suivi.sessionsDone")}
                value={profile.progress.totalCompletedSessions}
                subtitle={t("common.total")}
                tone="qcm"
              />
              <MetricCard
                label={t("suivi.accuracy")}
                value={profile.progress.accuracy !== null ? `${profile.progress.accuracy}%` : "—"}
                subtitle={t("suivi.accuracySubtitle")}
                tone="suivi"
              />
              <MetricCard
                label={t("suivi.avgScore")}
                value={profile.progress.averageScore !== null ? `${profile.progress.averageScore}%` : "—"}
                subtitle={t("suivi.avgScoreSubtitle")}
                tone="primary"
              />
            </div>
          </section>

          {/* Recent activity, top 5 entry (same cap as the backend payload). */}
          <section aria-label={t("suivi.recentActivity")} className="mt-section-gap">
            <h2 className="font-display text-h3 font-semibold text-text-primary">{t("suivi.recentActivity")}</h2>
            {recentActivity.length === 0 ? (
              <p className="mt-3 text-meta text-text-tertiary">{t("suivi.noActivityTitle")}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {recentActivity.map((item, index) => (
                  <li
                    key={item.type === "session" ? item.id : `${item.lessonId}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface-1 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-body text-text-primary">
                      {item.type === "session" ? item.name : item.title}
                    </span>
                    <span className="shrink-0 text-caption text-text-tertiary">
                      {item.type === "session"
                        ? item.score !== null
                          ? `${item.score}%`
                          : t("suivi.unscored")
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </PageShell>
  );
}
