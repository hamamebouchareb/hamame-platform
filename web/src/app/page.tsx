"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { ButtonLink, FeatureCard, Footer, LanguageToggle } from "@/components";
import type { AccentTone } from "@/components/FeatureCard";
import type { I18nKey } from "@/lib/i18n";

/** Thin stroke icons, inline so the landing page adds no icon dependency.
 *  `currentColor` lets FeatureCard's accent tint drive the color. */
function Icon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const FEATURES: { titleKey: I18nKey; bodyKey: I18nKey; tone: AccentTone; path: string }[] = [
  // Checklist — the reviewed bank.
  { titleKey: "landing.f1Title", bodyKey: "landing.f1Body", tone: "qcm", path: "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" },
  // Stacked layers — the curriculum tree.
  { titleKey: "landing.f2Title", bodyKey: "landing.f2Body", tone: "library", path: "M12 3l9 5-9 5-9-5 9-5zm9 11l-9 5-9-5" },
  // Timer — practice vs exam.
  { titleKey: "landing.f3Title", bodyKey: "landing.f3Body", tone: "primary", path: "M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" },
  // Loop — spaced repetition.
  { titleKey: "landing.f4Title", bodyKey: "landing.f4Body", tone: "revision", path: "M21 12a9 9 0 01-9 9 9 9 0 01-8.5-6M3 12a9 9 0 019-9 9 9 0 018.5 6M3 5v5h5m13 9v-5h-5" },
  // Rising bars — progress.
  { titleKey: "landing.f5Title", bodyKey: "landing.f5Body", tone: "suivi", path: "M4 20V10m6 10V4m6 16v-7m4 7H2" },
  // Calendar — scheduled simulations.
  { titleKey: "landing.f6Title", bodyKey: "landing.f6Body", tone: "secondary", path: "M8 3v4m8-4v4M4 9h16M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" },
];

/**
 * Public marketing surface. Signed-in visitors never see it — they are sent to
 * the dashboard, which keeps `/` the single entry point for both states.
 */
export default function Home() {
  const router = useRouter();
  const { user, isHydrated } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    if (isHydrated && user) router.replace("/dashboard");
  }, [isHydrated, user, router]);

  return (
    <>
      <a
        href="#landing-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-body focus:text-text-primary"
      >
        {t("landing.skipToContent")}
      </a>

      <header className="border-b border-border bg-surface-1/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-card-padding py-3">
          <Link
            href="/"
            className="inline-flex min-h-touch-target shrink-0 items-center gap-2 font-display text-body font-bold text-text-primary sm:text-h3"
          >
            <span
              aria-hidden
              className="flex h-8 w-8 items-center justify-center rounded-pill bg-accent-primary text-caption font-bold text-on-accent"
            >
              H
            </span>
            Hamame
          </Link>

          <div className="flex items-center gap-2">
            <LanguageToggle />
            {/* The auth pair drops out below `sm`: logo + toggle + both buttons needs
                364px, which overflows a 320–375px phone. The hero's two CTAs sit directly
                below the fold, so nothing is lost. Visibility lives on this wrapper rather
                than on the buttons because `buttonClasses` already sets `inline-flex` and
                cx() only concatenates — the base utility would win the specificity tie. */}
            <nav aria-label={t("landing.navAria")} className="hidden items-center gap-2 sm:flex">
              <ButtonLink href="/login" variant="ghost" size="sm">
                {t("landing.signIn")}
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                {t("landing.signUp")}
              </ButtonLink>
            </nav>
          </div>
        </div>
      </header>

      <main id="landing-main" className="mx-auto w-full max-w-6xl flex-1 px-card-padding">
        <section className="flex flex-col items-center gap-5 py-12 text-center md:py-20">
          <p className="rounded-pill border border-border bg-surface-1 px-4 py-1.5 text-meta font-medium text-accent-soft">
            {t("landing.badge")}
          </p>
          <h1 className="max-w-3xl font-display text-h1 font-bold leading-tight text-text-primary md:text-hero">
            {t("landing.heroTitle")}
          </h1>
          <p className="max-w-2xl text-body text-text-secondary">{t("landing.heroLead")}</p>
          <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
            <ButtonLink href="/register" size="lg" width="full-mobile">
              {t("landing.ctaPrimary")}
            </ButtonLink>
            <ButtonLink href="/login" variant="outline" size="lg" width="full-mobile">
              {t("landing.ctaSecondary")}
            </ButtonLink>
          </div>
        </section>

        <section className="py-8 md:py-12">
          <h2 className="font-display text-h2 font-bold text-text-primary">{t("landing.featuresTitle")}</h2>
          <p className="mt-2 max-w-2xl text-body text-text-secondary">{t("landing.featuresLead")}</p>

          <div className="mt-section-gap grid gap-card-gap sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <FeatureCard
                key={feature.titleKey}
                icon={<Icon path={feature.path} />}
                title={t(feature.titleKey)}
                description={t(feature.bodyKey)}
                tone={feature.tone}
              />
            ))}
          </div>
        </section>

        <section className="my-8 flex flex-col items-center gap-4 rounded-card-lg border border-border bg-surface-2 px-card-padding py-10 text-center shadow-card md:my-12">
          <h2 className="font-display text-h2 font-bold text-text-primary">{t("landing.closingTitle")}</h2>
          <p className="max-w-xl text-body text-text-secondary">{t("landing.closingLead")}</p>
          <ButtonLink href="/register" size="lg" className="mt-1">
            {t("landing.ctaPrimary")}
          </ButtonLink>
        </section>
      </main>

      <Footer />
    </>
  );
}
