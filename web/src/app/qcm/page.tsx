"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
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
  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-card-lg border border-border bg-surface-1 p-card-padding shadow-card transition hover:border-border-strong hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
      style={{ borderTop: `3px solid ${accentVar(tone)}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className={cxFont(tone)}>{title}</h2>
        <span className={cxBadge(tone)}>100% gratuit</span>
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

  function handleLogout() {
    logout();
    router.push("/login");
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

      <main className="mx-auto w-full max-w-6xl flex-1 px-card-padding py-section-gap">
        <section aria-label="Présentation de la banque QCM" className="mx-auto max-w-3xl text-center">
          <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">Banque de questions</p>
          <h1 className="mt-2 font-display text-hero font-bold leading-tight text-text-primary">
            Entraînez-vous sur de vrais sujets d&apos;examen
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary">
            Des milliers de questions officielles et rédigées par la communauté, filtrées par module. Gratuites pour
            tous les membres inscrits.
          </p>
        </section>

        <section aria-label="Choix du mode" className="mx-auto mt-section-gap grid max-w-4xl grid-cols-1 gap-card-gap md:grid-cols-2">
          <DecisionCard
            href="/qcm/builder?mode=practice"
            title="Créer une session"
            description="Choisissez votre module, les types de questions et le nombre. Chaque réponse est corrigée immédiatement avec son explication."
            points={[
              "Filtres par faculté, année, module et unité",
              "Correction immédiate question par question",
              "Idéal pour réviser un chapitre précis",
            ]}
            cta="Configurer"
            tone="qcm"
          />
          <DecisionCard
            href="/qcm/builder?mode=exam"
            title="Examen"
            description="Conditions réelles : minuterie, aucun corrigé pendant l'épreuve, score détaillé à la fin. Parfait avant les partiels."
            points={[
              "Minuterie et mise en condition d'examen",
              "Correction uniquement en fin de session",
              "Score final avec revue de chaque question",
            ]}
            cta="Lancer un examen"
            tone="secondary"
          />
        </section>

        <p className="mt-section-gap text-center text-meta text-text-tertiary">
          La banque QCM est entièrement gratuite pour tous les membres — aucun abonnement requis pour s&apos;entraîner.
        </p>
      </main>

      <Footer />
    </>
  );
}
