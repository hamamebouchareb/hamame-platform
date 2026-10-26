"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { PageShell, ButtonLink, Card, ErrorState, LoadingSkeleton, Icon } from "@/components";
import { accentText, accentVar, type AccentTone } from "@/components/FeatureCard";
import { cx } from "@/lib/cx";
import type { IconName } from "@/components/Icon";
import type { SessionHistoryEntry } from "@/lib/types";

interface HistoryResponse {
  sessions: SessionHistoryEntry[];
  pagination: { page: number; limit: number; total: number };
}

function formatDate(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleString(localeFor(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function accuracy(answered: number, correct: number): string {
  if (answered === 0) return "—";
  return `${Math.round((correct / answered) * 100)} %`;
}

interface DecisionCardProps {
  href: string;
  title: string;
  description: string;
  points: string[];
  cta: string;
  tone: AccentTone;
  icon: IconName;
}

function DecisionCard({ href, title, description, points, cta, tone, icon }: DecisionCardProps) {
  const { t } = useLanguage();
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-card-lg border border-border bg-surface-1 p-card-padding shadow-card transition hover:border-border-strong hover:bg-surface-2 hover:shadow-glow-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
      style={{ borderTop: `3px solid ${accentVar(tone)}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex h-11 w-11 items-center justify-center rounded-control text-on-accent"
          style={{ background: accentVar(tone) }}
          aria-hidden
        >
          <Icon name={icon} size={22} />
        </span>
        <span className={cxBadge(tone)}>{t("qcm.freeBadge")}</span>
      </div>
      <h2 className={cxFont(tone)}>{title}</h2>
      <p className="text-body text-text-secondary">{description}</p>
      <ul className="flex flex-col gap-1.5">
        {points.map((point) => (
          <li key={point} className="flex items-center gap-2 text-meta text-text-secondary">
            <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-current opacity-60" aria-hidden />
            {point}
          </li>
        ))}
      </ul>
      <span
        className={cxCta(tone)}
      >
        {cta}
        <span aria-hidden className="transition-transform group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}

function cxFont(tone: AccentTone): string {
  return cx(`font-display text-h3 font-semibold ${accentText(tone)}`);
}

function cxBadge(tone: AccentTone): string {
  return cx(
    "shrink-0 rounded-pill border px-2.5 py-0.5 text-caption font-medium",
    tone === "secondary"
      ? "border-accent-secondary/40 bg-accent-secondary/15 text-accent-soft"
      : "border-accent-qcm/40 bg-accent-qcm/15 text-accent-soft"
  );
}

function cxCta(tone: AccentTone): string {
  const base =
    "inline-flex min-h-touch-target w-fit items-center justify-center gap-2 rounded-control px-5 text-body font-semibold text-on-accent transition group-hover:brightness-110 active:scale-[0.98]";
  return cx(
    base,
    tone === "secondary" ? "bg-accent-secondary shadow-glow-secondary" : "bg-accent-qcm shadow-glow-qcm"
  );
}

function RecentSessions({ canFetch }: { canFetch: boolean }) {
  const { lang, t } = useLanguage();
  const { data, error, isLoading, refetch } = useApiResource<HistoryResponse>(
    canFetch ? "/sessions?page=1&limit=6" : null
  );

  const groups = useMemo(() => {
    const map = new Map<string, SessionHistoryEntry[]>();
    for (const session of data?.sessions ?? []) {
      const first = session.units[0];
      const key = first ? `${first.facultyName} · ${first.yearLabel}` : t("history.others");
      const list = map.get(key) ?? [];
      list.push(session);
      map.set(key, list);
    }
    return [...map.entries()]
      .slice(0, 2)
      .map(([label, list]) => [label, list.slice(0, 3)] as const);
  }, [data, t]);

  const isEmpty = !isLoading && !error && (data?.sessions.length ?? 0) === 0;

  return (
    <section aria-label={t("qcm.recentTitle")} className="mt-section-gap">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-h3 font-semibold text-text-primary">{t("qcm.recentTitle")}</h2>
          <p className="mt-1 text-meta text-text-secondary">{t("qcm.recentSub")}</p>
        </div>
        {!isLoading && !error && !isEmpty ? (
          <Link
            href="/historique"
            className="inline-flex min-h-touch-target items-center text-meta font-medium text-accent-soft transition hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {t("qcm.viewAll")}
          </Link>
        ) : null}
      </div>

      {isLoading && !data ? (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <LoadingSkeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>
      ) : null}

      {error ? <ErrorState className="mt-4" message={error} onRetry={refetch} /> : null}

      {isEmpty ? (
        <Card className="mt-4">
          <ButtonLink href="/qcm/builder?mode=practice">{t("qcm.practiceCta")}</ButtonLink>
        </Card>
      ) : null}

      {groups.map(([groupLabel, groupSessions]) => (
        <section key={groupLabel} aria-label={groupLabel} className="mt-4">
          <h3 className="font-display text-body font-semibold text-text-primary">{groupLabel}</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {groupSessions.map((session) => {
              const completed = session.completedAt !== null;
              return (
                <Card as="li" key={session.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-semibold text-text-primary">{session.name}</p>
                      <p className="mt-0.5 text-meta text-text-tertiary">
                        {session.mode === "exam" ? t("builder.nameExam") : t("builder.namePractice")} · {formatDate(session.startedAt, lang)}
                      </p>
                      <p className="mt-1 text-meta text-text-secondary">
                        {t("history.answered", { a: session.stats.answered, t: session.stats.total })}
                        {" · "}
                        {t("history.accuracy", { v: accuracy(session.stats.answered, session.stats.correct) })}
                        {completed && session.score !== null ? ` · ${t("history.score", { v: Math.round(session.score) })}` : null}
                        {completed ? ` · ${t("history.done")}` : ` · ${t("dashboard.inProgress")}`}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-3" aria-hidden>
                        <div
                          className="h-full rounded-pill bg-accent-qcm"
                          style={{
                            width: `${session.stats.total === 0 ? 0 : Math.round((session.stats.answered / session.stats.total) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <ButtonLink
                      href={completed ? `/sessions/${session.id}/results` : `/sessions/${session.id}`}
                      variant="outline"
                    >
                      {completed ? t("history.review") : t("history.continue")}
                    </ButtonLink>
                  </div>
                </Card>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}

export default function QcmPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { user, isHydrated } = useRequireAuth();
  const { t } = useLanguage();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="wide"
      kicker={t("qcm.kicker")}
      title={t("qcm.title")}
      titleSize="hero"
      description={t("qcm.subtitle")}
    >
      <section aria-label={t("qcm.modeAria")} className="mt-section-gap grid grid-cols-1 gap-card-gap md:grid-cols-2">
        <DecisionCard
          href="/qcm/builder?mode=practice"
          title={t("qcm.practiceTitle")}
          description={t("qcm.practiceDesc")}
          points={[t("qcm.practiceP1"), t("qcm.practiceP2"), t("qcm.practiceP3")]}
          cta={t("qcm.practiceCta")}
          tone="qcm"
          icon="qcm"
        />
        <DecisionCard
          href="/qcm/builder?mode=exam"
          title={t("builder.nameExam")}
          description={t("qcm.examDesc")}
          points={[t("qcm.examP1"), t("qcm.examP2"), t("qcm.examP3")]}
          cta={t("qcm.examCta")}
          tone="secondary"
          icon="simulations"
        />
      </section>

      <RecentSessions canFetch={isHydrated && !!user} />

      <p className="mt-section-gap text-center text-meta text-text-tertiary">{t("qcm.footnote")}</p>
    </PageShell>
  );
}
