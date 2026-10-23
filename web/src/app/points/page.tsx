"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type I18nKey, type UiLanguage } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { AppHeader, EmptyState, Footer, LoadingSkeleton } from "@/components";
import { cx } from "@/lib/cx";

interface PointsAccount {
  balance: number;
  earnedTotal: number;
  spentTotal: number;
}

interface LedgerRow {
  id: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
}

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  costPoints: number;
  amount: number;
  planId: string | null;
  badgeId: string | null;
  isActive: boolean;
  planName: string | null;
  badgeName: string | null;
}

interface RedemptionRow {
  id: string;
  itemName: string;
  kind: string | null;
  costPoints: number;
  grantedAt: string;
}

const REASON_LABEL_KEYS: Record<string, string> = {
  daily_bonus: "pts.reasonDaily",
  session_complete: "pts.reasonSession",
  streak_milestone: "pts.reasonMilestone",
  admin_grant: "pts.reasonAdmin",
  shop_redeem: "pts.reasonRedeem",
};

function formatWhen(iso: string, lang: UiLanguage): string {
  try {
    return new Date(iso).toLocaleString(localeFor(lang), {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

export default function PointsPage() {
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();
  const { lang, t } = useLanguage();

  function handleLogout() {
    void logout();
  }

  const [account, setAccount] = useState<PointsAccount | null>(null);
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [redemptions, setRedemptions] = useState<RedemptionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [redeemBusyId, setRedeemBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const ledgerRef = useRef<LedgerRow[]>([]);
  useEffect(() => {
    ledgerRef.current = ledger;
  }, [ledger]);

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const flash = useCallback((text: string) => {
    setActionNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setActionNotice(null), 4000);
  }, []);

  const loadLedgerAndRedemptions = useCallback(async () => {
    const [ledgerData, redemptionData] = await Promise.all([
      apiFetch<{ ledger: LedgerRow[] }>("/points/ledger?limit=25"),
      apiFetch<{ redemptions: RedemptionRow[] }>("/points/redemptions?limit=10"),
    ]);
    setLedger(ledgerData.ledger);
    setRedemptions(redemptionData.redemptions);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [accountData, shopData] = await Promise.all([
          apiFetch<PointsAccount>("/points"),
          apiFetch<{ items: ShopItem[] }>("/points/shop"),
        ]);
        if (cancelled) return;
        setAccount(accountData);
        setShop(shopData.items);
        await loadLedgerAndRedemptions();
        const claimedToday = ledgerRef.current.some(
          (row) => row.reason === "daily_bonus" && utcDateKey(new Date(row.createdAt)) === utcDateKey(new Date())
        );
        setDailyClaimed(claimedToday);
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err, t("pts.loadFailed")));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    if (isHydrated) void load();
    return () => {
      cancelled = true;
    };
  }, [isHydrated, t, loadLedgerAndRedemptions]);

  async function handleClaimDaily() {
    setClaimBusy(true);
    setActionError(null);
    try {
      const result = await apiFetch<{ status: string; balance: number }>("/points/claim-daily", { method: "POST" });
      if (result.status === "awarded") {
        setAccount((prev) => (prev ? { ...prev, balance: result.balance, earnedTotal: prev.earnedTotal + 5 } : prev));
        setDailyClaimed(true);
        flash(t("pts.claimed"));
      } else {
        setDailyClaimed(true);
        flash(t("pts.alreadyClaimed"));
      }
      await loadLedgerAndRedemptions();
    } catch (err) {
      setActionError(errorMessage(err, t("pts.actionFailed")));
    } finally {
      setClaimBusy(false);
    }
  }

  function handleConfirmRedeem(itemId: string, affordable: boolean) {
    if (!affordable) {
      setActionError(t("pts.insufficient"));
      return;
    }
    setConfirmingId((prev) => (prev === itemId ? null : itemId));
  }

  async function handleRedeem(itemId: string) {
    setRedeemBusyId(itemId);
    setActionError(null);
    try {
      const result = await apiFetch<{ balance: number }>(`/points/shop/${itemId}/redeem`, { method: "POST" });
      setAccount((prev) => (prev ? { ...prev, balance: result.balance } : prev));
      setConfirmingId(null);
      flash(t("pts.redeemed"));
      const [shopData] = await Promise.all([
        apiFetch<{ items: ShopItem[] }>("/points/shop"),
        loadLedgerAndRedemptions(),
      ]);
      setShop(shopData.items);
    } catch (err) {
      setActionError(errorMessage(err, t("pts.actionFailed")));
    } finally {
      setRedeemBusyId(null);
    }
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" />
      </main>
    );
  }

  return (
    <div className="min-h-screen dark:bg-slate-950 bg-white">
      <AppHeader user={user} onLogout={handleLogout} />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t("pts.title")}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{t("pts.subtitle")}</p>
        </header>

        {error && (
          <EmptyState
            title={t("pts.loadFailed")}
            description={error}
            action={{ href: "/dashboard", label: t("pts.backHome") }}
          />
        )}

        {isLoading && <LoadingSkeleton className="h-96" />}

        {!isLoading && account && (
          <>
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6 bg-slate-50 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("pts.balanceLabel")}
              </p>
              <p className="text-4xl font-extrabold text-blue-600 dark:text-blue-400">
                {account.balance} <span className="text-lg font-semibold">{t("pts.unit")}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t("pts.totals")
                  .replace("{earned}", String(account.earnedTotal))
                  .replace("{spent}", String(account.spentTotal))}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleClaimDaily}
                  disabled={claimBusy || dailyClaimed}
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dailyClaimed ? t("pts.claimedButton") : t("pts.claimButton")}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("pts.earnTitle")}</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300 list-disc list-inside">
                <li>{t("pts.earnSession")}</li>
                <li>{t("pts.earnDaily")}</li>
                <li>{t("pts.earnStreak")}</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("pts.shopTitle")}</h2>
              {shop.length === 0 ? (
                <EmptyState
                  title={t("pts.shopEmpty")}
                  description={t("pts.shopEmptyDesc")}
                  action={{ href: "/dashboard", label: t("pts.backHome") }}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {shop.map((item) => {
                    const affordable = Boolean(account && account.balance >= item.costPoints);
                    return (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-white">{item.name}</h3>
                            {item.description && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>
                            )}
                          </div>
                          <span className="shrink-0 rounded-full bg-blue-50 dark:bg-blue-950 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">
                            {item.costPoints} {t("pts.unit")}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.kind === "plan_days"
                            ? item.planName
                              ? `${t("pts.kindPlanDaysPrefix")} ${item.amount} ${t("pts.daysSuffix")}`
                              : t("pts.kindGeneric")
                            : item.badgeName
                              ? `${t("pts.kindBadgePrefix")} ${item.badgeName}`
                              : t("pts.kindGeneric")}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleConfirmRedeem(item.id, affordable)}
                          disabled={redeemBusyId === item.id}
                          className={cx(
                            "mt-auto rounded-full px-4 py-2 text-sm font-semibold",
                            affordable
                              ? "bg-blue-600 text-white hover:bg-blue-700"
                              : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500"
                          )}
                        >
                          {redeemBusyId === item.id ? t("pts.redeeming") : t("pts.redeemButton")}                        </button>
                        {confirmingId === item.id && (
                          <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 p-3 text-xs space-y-2">
                            <p className="text-blue-900 dark:text-blue-200">
                              {t("pts.confirmRedeem")
                                .replace("{cost}", String(item.costPoints))
                                .replace("{name}", item.name)}
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleRedeem(item.id)}
                                className="rounded-full bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700"
                              >
                                {t("pts.confirmYes")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingId(null)}
                                className="rounded-full border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-semibold text-slate-700 dark:text-slate-300"
                              >
                                {t("pts.confirmNo")}
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {redemptions.length > 0 && (
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("pts.redemptionsTitle")}</h2>
                <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                  {redemptions.map((row) => (
                    <li key={row.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-800 dark:text-slate-200">{row.itemName}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        −{row.costPoints} {t("pts.unit")} · {formatWhen(row.grantedAt, lang)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("pts.ledgerTitle")}</h2>
              {ledger.length === 0 ? (
                <EmptyState
                  title={t("pts.ledgerEmpty")}
                  description={t("pts.ledgerEmptyDesc")}
                  action={{ href: "/dashboard", label: t("pts.backHome") }}
                />
              ) : (
                <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                  {ledger.map((row) => (
                    <li key={row.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-800 dark:text-slate-200">
                        {t((REASON_LABEL_KEYS[row.reason] || "pts.reasonAdmin") as I18nKey)}
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className={cx(
                            "font-semibold",
                            row.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                          )}
                        >
                          {row.delta >= 0 ? `+${row.delta}` : row.delta}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formatWhen(row.createdAt, lang)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {actionNotice && (
              <p className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
                {actionNotice}
              </p>
            )}
            {actionError && (
              <p className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
                {actionError}
              </p>
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
