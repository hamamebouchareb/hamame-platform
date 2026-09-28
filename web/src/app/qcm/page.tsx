"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { AppHeader, Footer, LoadingSkeleton } from "@/components";
import { accentText, accentVar, type AccentTone } from "@/components/FeatureCard";
import { cx } from "@/lib/cx";

interface DecisionCardProps {
  href: string;
  title: string;
  description: string;
  points: string[];
  cta: string;
  tone: AccentTone;
}

function DecisionCard({ href, title, description, points, cta, tone }: DecisionCardProps) {
  const { t } = useLanguage();
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-card-lg border border-border bg-surface-1 p-card-padding shadow-card transition hover:border-border-strong hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
      style={{ borderTop: `3px solid ${accentVar(tone)}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className={cxFont(tone)}>{title}</h2>
        <span className={cxBadge(tone)}>{t("qcm.freeBadge")}</span>
      </div>
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

export default function QcmPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const { user, isHydrated } = useRequireAuth();
  const { t } = useLanguage();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" ariaLabel={t("common.loading")} />
      </main>
    );
  }

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-card-padding py-section-gap">
        <section aria-label={t("qcm.heroAria")} className="mx-auto max-w-3xl text-center">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">{t("qcm.kicker")}</p>
          <h1 className="mt-2 font-display text-hero font-bold leading-tight text-text-primary">
            {t("qcm.title")}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary">
            {t("qcm.subtitle")}
          </p>
        </section>

        <section aria-label={t("qcm.modeAria")} className="mx-auto mt-section-gap grid max-w-4xl grid-cols-1 gap-card-gap md:grid-cols-2">
          <DecisionCard
            href="/qcm/builder?mode=practice"
            title={t("qcm.practiceTitle")}
            description={t("qcm.practiceDesc")}
            points={[
              t("qcm.practiceP1"),
              t("qcm.practiceP2"),
              t("qcm.practiceP3"),
            ]}
            cta={t("qcm.practiceCta")}
            tone="qcm"
          />
          <DecisionCard
            href="/qcm/builder?mode=exam"
            title={t("builder.nameExam")}
            description={t("qcm.examDesc")}
            points={[
              t("qcm.examP1"),
              t("qcm.examP2"),
              t("qcm.examP3"),
            ]}
            cta={t("qcm.examCta")}
            tone="secondary"
          />
        </section>

        <p className="mt-section-gap text-center text-meta text-text-tertiary">
          {t("qcm.footnote")}
        </p>
      </main>

      <Footer />
    </>
  );
}
