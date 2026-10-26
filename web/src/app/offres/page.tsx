"use client";

import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { useApiResource } from "@/lib/useApiResource";
import { ButtonLink, Card, ErrorState, LoadingSkeleton, PageShell } from "@/components";
import type { AiCreditPack, PremiumOffer } from "@/lib/types";

// Free vs Premium vs jetons in one place. Every number is read from the API
// (plans + wallet catalog), so admin price edits show up here unchanged.

interface PlanRow {
  name: string;
  features: { aiCredits?: { dailyAllowance: number }; dailyQuestionLimit?: number };
}

interface Catalog {
  pricing: { dzdPerJeton: number };
  premiumOffers: PremiumOffer[];
  aiCreditPacks: AiCreditPack[];
}

function formatNumber(value: number, lang: UiLanguage): string {
  return new Intl.NumberFormat(localeFor(lang)).format(value);
}

export default function OffersPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { lang, t } = useLanguage();
  const canFetch = isHydrated && !!user;
  const plans = useApiResource<{ plans: PlanRow[] }>(canFetch ? "/plans" : null);
  const catalog = useApiResource<Catalog>(canFetch ? "/wallet/catalog" : null);

  const free = plans.data?.plans.find((plan) => plan.name === "free");
  const premium = plans.data?.plans.find((plan) => plan.name === "premium");
  const freeQuestions = free?.features.dailyQuestionLimit ?? 20;
  const freeAi = free?.features.aiCredits?.dailyAllowance ?? 5;
  const premiumAi = premium?.features.aiCredits?.dailyAllowance ?? 30;

  const rows: { label: string; free: string; premium: string }[] = [
    { label: t("offers.rowQuestions"), free: t("offers.freeQuestions", { n: freeQuestions }), premium: t("offers.premQuestions") },
    { label: t("offers.rowResources"), free: t("offers.freeResources"), premium: t("offers.premResources") },
    { label: t("offers.rowAi"), free: String(freeAi), premium: String(premiumAi) },
    { label: t("offers.rowExtraAi"), free: t("offers.extraAi"), premium: t("offers.extraAi") },
    { label: t("offers.rowSimulations"), free: t("offers.included"), premium: t("offers.included") },
  ];

  const faqs = [
    [t("offers.faq1q"), t("offers.faq1a")],
    [t("offers.faq2q"), t("offers.faq2a")],
    [t("offers.faq3q"), t("offers.faq3a")],
    [t("offers.faq4q"), t("offers.faq4a")],
  ];

  const error = plans.error ?? catalog.error;
  const loading = plans.isLoading || catalog.isLoading;

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      title={t("offers.title")}
      description={t("offers.subtitle")}
      loadingLabel={t("common.loading")}
    >
      {loading && <LoadingSkeleton className="mt-section-gap h-64 w-full rounded-card" ariaLabel={t("common.loading")} />}
      {error && <ErrorState message={error} className="mt-section-gap" />}

      {plans.data && catalog.data && (
        <div className="mt-section-gap flex flex-col gap-section-gap" data-offers>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-meta">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-4 py-3 font-semibold text-text-secondary">{t("offers.colFeature")}</th>
                  <th scope="col" className="px-4 py-3 font-display text-body font-bold text-text-primary">{t("offers.free")}</th>
                  <th scope="col" className="px-4 py-3 font-display text-body font-bold text-accent-primary">{t("offers.premium")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-b-0">
                    <th scope="row" className="px-4 py-3 font-medium text-text-primary">{row.label}</th>
                    <td className="px-4 py-3 text-text-secondary">{row.free}</td>
                    <td className="px-4 py-3 font-semibold text-text-primary">{row.premium}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <section aria-labelledby="offers-prices">
            <h2 id="offers-prices" className="font-display text-h3 font-bold text-text-primary">{t("offers.pricesTitle")}</h2>
            <ul className="mt-4 grid grid-cols-1 gap-card-gap sm:grid-cols-3">
              {catalog.data.premiumOffers.map((offer) => (
                <Card as="li" key={offer.id} className="flex flex-col gap-1">
                  <p className="font-display text-h3 font-bold text-text-primary">{offer.label}</p>
                  <p className="text-meta text-text-secondary">{t("prem.days", { n: offer.durationDays })}</p>
                  <p className="mt-2 font-display text-h2 font-bold text-text-primary">
                    {formatNumber(offer.priceJetons, lang)} <span className="text-body font-semibold text-text-secondary">{t("wal.unit")}</span>
                  </p>
                  <p className="text-meta text-text-secondary">{formatNumber(offer.priceDzd, lang)} DA</p>
                </Card>
              ))}
            </ul>
            <ButtonLink href="/subscription" className="mt-4">
              {t("offers.ctaPremium")}
            </ButtonLink>
          </section>

          <section aria-labelledby="offers-jetons">
            <h2 id="offers-jetons" className="font-display text-h3 font-bold text-text-primary">{t("offers.jetonsTitle")}</h2>
            <p className="mt-2 text-body text-text-secondary">{t("offers.jetonsBody", { dzd: catalog.data.pricing.dzdPerJeton })}</p>
            <ol className="mt-4 grid grid-cols-1 gap-card-gap sm:grid-cols-3">
              {[t("offers.step1"), t("offers.step2"), t("offers.step3")].map((step, index) => (
                <Card as="li" key={step} className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-primary font-semibold text-on-accent">
                    {index + 1}
                  </span>
                  <span className="text-meta font-medium text-text-primary">{step}</span>
                </Card>
              ))}
            </ol>
          </section>

          <section aria-labelledby="offers-ai">
            <h2 id="offers-ai" className="font-display text-h3 font-bold text-text-primary">{t("wal.aiTitle")}</h2>
            <p className="mt-2 text-meta text-text-secondary">{t("wal.aiDesc")}</p>
            <ul className="mt-4 grid grid-cols-1 gap-card-gap sm:grid-cols-3">
              {catalog.data.aiCreditPacks.map((pack) => (
                <Card as="li" key={pack.id} className="flex flex-col gap-1">
                  <p className="font-display text-h3 font-bold text-text-primary">{t("wal.aiCredits", { n: pack.credits })}</p>
                  <p className="text-meta text-text-secondary">
                    {t("wal.priceTag", { n: pack.priceJetons })} · {formatNumber(pack.priceDzd, lang)} DA
                  </p>
                </Card>
              ))}
            </ul>
            <ButtonLink href="/wallet" variant="outline" className="mt-4">
              {t("offers.ctaWallet")}
            </ButtonLink>
          </section>

          <section aria-labelledby="offers-faq">
            <h2 id="offers-faq" className="font-display text-h3 font-bold text-text-primary">{t("offers.faqTitle")}</h2>
            <div className="mt-4 flex flex-col gap-card-gap">
              {faqs.map(([question, answer]) => (
                <Card key={question}>
                  <h3 className="text-body font-semibold text-text-primary">{question}</h3>
                  <p className="mt-1 text-meta text-text-secondary">{answer}</p>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
