"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { apiFetch, ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";
import {
  ActivationCodeCard,
  Button,
  ButtonLink,
  Card,
  ErrorState,
  LoadingSkeleton,
  PageShell,
  PromoCodeCard,
  Select,
} from "@/components";
import type { Entitlements, Faculty, PremiumOffer, Year } from "@/lib/types";

// Premium is bought with wallet jetons for one faculty-year (offers and
// prices come from GET /api/wallet). Activation and promo codes still work.

function formatDate(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleDateString(localeFor(lang), { dateStyle: "medium" });
}

function formatNumber(value: number, lang: UiLanguage): string {
  return new Intl.NumberFormat(localeFor(lang)).format(value);
}

export default function SubscriptionPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { lang, t } = useLanguage();
  const canFetch = isHydrated && !!user;

  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [offers, setOffers] = useState<PremiumOffer[]>([]);
  const [balance, setBalance] = useState(0);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [yearId, setYearId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string; topUp?: boolean } | null>(null);

  const load = useCallback(async () => {
    const ent = await apiFetch<Entitlements>("/subscriptions/me/entitlements");
    const wallet = await apiFetch<{ balance: number; premiumOffers: PremiumOffer[] }>("/wallet");
    const facultyData = await apiFetch<{ faculties: Faculty[] }>("/faculties");
    setEntitlements(ent);
    setOffers(wallet.premiumOffers);
    setBalance(wallet.balance);
    setFaculties(facultyData.faculties);
    return ent;
  }, []);

  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const ent = await load();
        if (cancelled) return;
        setFacultyId(ent.premium?.facultyId ?? user?.facultyId ?? "");
        setYearId(ent.premium?.yearId ?? user?.yearId ?? "");
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("auth.genericError"));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canFetch, load, t, user?.facultyId, user?.yearId]);

  useEffect(() => {
    if (!facultyId) return;
    let cancelled = false;
    apiFetch<{ years: Year[] }>(`/faculties/${facultyId}/years`)
      .then((data) => {
        if (!cancelled) setYears(data.years);
      })
      .catch(() => {
        if (!cancelled) setYears([]);
      });
    return () => {
      cancelled = true;
    };
  }, [facultyId]);

  function changeFaculty(id: string) {
    setFacultyId(id);
    setYearId("");
    setYears([]);
  }

  async function refresh() {
    try {
      await load();
    } catch {
      // The notice from the action that triggered this refresh stays visible.
    }
  }

  async function buy(offer: PremiumOffer) {
    setNotice(null);
    if (!yearId) {
      setNotice({ kind: "error", text: t("prem.pickYear") });
      return;
    }
    setBusyOfferId(offer.id);
    try {
      const result = await apiFetch<{ subscription: { currentPeriodEnd: string } }>("/wallet/premium", {
        method: "POST",
        body: JSON.stringify({ offerId: offer.id, yearId }),
      });
      setNotice({ kind: "success", text: t("prem.bought", { date: formatDate(result.subscription.currentPeriodEnd, lang) }) });
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "INSUFFICIENT_JETONS") {
        setNotice({
          kind: "error",
          text: t("prem.insufficient", { price: offer.priceJetons, balance: Number(err.details?.balance ?? balance) }),
          topUp: true,
        });
      } else if (err instanceof ApiError && err.code === "PREMIUM_OTHER_YEAR") {
        const until = typeof err.details?.currentPeriodEnd === "string" ? err.details.currentPeriodEnd : null;
        setNotice({ kind: "error", text: t("prem.otherYear", { date: until ? formatDate(until, lang) : "—" }) });
      } else {
        setNotice({ kind: "error", text: err instanceof ApiError ? err.message : t("auth.genericError") });
      }
    } finally {
      setBusyOfferId(null);
    }
  }

  const premium = entitlements?.premium ?? null;
  const monthlyOffer = offers.find((offer) => offer.durationDays <= 31);

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      title={t("nav.subscription")}
      loadingLabel={t("billing.loading")}
    >
      {isLoading && <LoadingSkeleton className="mt-section-gap h-40 w-full rounded-card" ariaLabel={t("billing.loadingSub")} />}
      {loadError && <ErrorState message={loadError} onRetry={() => void refresh()} className="mt-section-gap" />}

      {entitlements && (
        <div className="mt-section-gap flex flex-col gap-section-gap">
          <Card radius="card-lg" accentTone="primary" data-entitlements>
            {premium ? (
              <>
                <p className="font-display text-h3 font-bold text-text-primary">
                  {premium.year
                    ? t("prem.statusPremium", { faculty: premium.faculty ?? "", year: premium.year })
                    : t("prem.statusPremiumNoYear")}
                </p>
                <p className="mt-1 text-meta text-text-secondary">{t("prem.until", { date: formatDate(premium.currentPeriodEnd, lang) })}</p>
              </>
            ) : (
              <>
                <p className="font-display text-h3 font-bold text-text-primary">{t("prem.statusFree")}</p>
                <p className="mt-1 text-meta text-text-secondary">
                  {t("quota.left", { remaining: entitlements.dailyQuestions.remaining, limit: entitlements.dailyQuestions.limit })}
                </p>
              </>
            )}
            <Link href="/offres" className="mt-3 inline-block text-meta font-semibold text-accent-primary hover:underline">
              {t("prem.compareLink")} →
            </Link>
          </Card>

          <section aria-labelledby="premium-offers">
            <h2 id="premium-offers" className="font-display text-h3 font-bold text-text-primary">
              {t("prem.offersTitle")}
            </h2>
            <p className="mt-1 text-meta text-text-secondary">{t("prem.offersDesc")}</p>

            <Card className="mt-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select id="premium-faculty" label={t("prem.faculty")} value={facultyId} onChange={(e) => changeFaculty(e.target.value)}>
                  <option value="">—</option>
                  {faculties.map((faculty) => (
                    <option key={faculty.id} value={faculty.id}>
                      {faculty.name}
                    </option>
                  ))}
                </Select>
                <Select
                  id="premium-year"
                  label={t("prem.year")}
                  value={yearId}
                  onChange={(e) => setYearId(e.target.value)}
                  disabled={!facultyId}
                >
                  <option value="">—</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.label}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="mt-2 text-caption text-text-tertiary">{t("prem.extendNote")}</p>
            </Card>

            <p className="mt-4 text-meta font-medium text-text-primary">
              {t("prem.balance", { n: formatNumber(balance, lang) })} ·{" "}
              <Link href="/wallet" className="font-semibold text-accent-primary hover:underline">
                {t("prem.topUp")}
              </Link>
            </p>

            {notice && (
              <div
                role={notice.kind === "error" ? "alert" : "status"}
                className={cx(
                  "mt-3 flex flex-wrap items-center justify-between gap-3 rounded-control border px-4 py-3 text-meta font-medium",
                  notice.kind === "success" ? "border-success text-text-primary" : "border-danger text-danger"
                )}
              >
                <span>{notice.text}</span>
                {notice.topUp && (
                  <ButtonLink href="/wallet" size="sm">
                    {t("prem.topUp")}
                  </ButtonLink>
                )}
              </div>
            )}

            <ul className="mt-4 grid grid-cols-1 gap-card-gap sm:grid-cols-3" data-premium-offers>
              {offers.map((offer) => {
                const months = Math.max(Math.round(offer.durationDays / 30), 1);
                const saving =
                  monthlyOffer && offer.id !== monthlyOffer.id
                    ? Math.round((1 - offer.priceJetons / (monthlyOffer.priceJetons * months)) * 100)
                    : 0;
                return (
                  <Card
                    as="li"
                    key={offer.id}
                    className={cx("relative flex flex-col gap-2", offer.badge === "recommended" && "border-accent-primary")}
                  >
                    {offer.badge && (
                      <span className="absolute -top-3 left-4 rounded-full bg-accent-primary px-3 py-0.5 text-caption font-semibold text-on-accent">
                        {offer.badge === "recommended" ? t("wal.badgeRecommended") : t("wal.badgeBestValue")}
                      </span>
                    )}
                    <p className="font-display text-h3 font-bold text-text-primary">{offer.label}</p>
                    <p className="text-meta text-text-secondary">{t("prem.days", { n: offer.durationDays })}</p>
                    <p className="font-display text-h2 font-bold text-text-primary">
                      {formatNumber(offer.priceJetons, lang)}{" "}
                      <span className="text-body font-semibold text-text-secondary">{t("wal.unit")}</span>
                    </p>
                    <p className="text-meta text-text-secondary">
                      {formatNumber(offer.priceDzd, lang)} DA · {t("prem.perMonth", { n: formatNumber(Math.round(offer.priceDzd / months), lang) })}
                      {saving > 0 ? ` · −${saving}%` : ""}
                    </p>
                    <Button
                      width="full"
                      className="mt-auto"
                      disabled={busyOfferId !== null}
                      onClick={() => void buy(offer)}
                    >
                      {busyOfferId === offer.id ? t("prem.buying") : t("prem.buy", { n: offer.priceJetons })}
                    </Button>
                  </Card>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="premium-codes">
            <h2 id="premium-codes" className="font-display text-h3 font-bold text-text-primary">
              {t("prem.codesTitle")}
            </h2>
            <div className="mt-4 flex flex-col gap-card-gap">
              <ActivationCodeCard onRedeemed={() => void refresh()} />
              <PromoCodeCard onRedeemed={() => void refresh()} />
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
