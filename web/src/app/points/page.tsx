"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type I18nKey, type UiLanguage } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { EmptyState, LoadingSkeleton, PageShell } from "@/components";
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
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("pts.title")}
      description={t("pts.subtitle")}
      loadingLabel={t("common.loading")}
    >
      <div className="mt-section-gap space-y-6">
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
            <section className="rounded-2xl border border-border bg-surface-1 p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                {t("pts.balanceLabel")}
              </p>
              <p className="text-4xl font-extrabold text-accent-soft">
                {account.balance} <span className="text-lg font-semibold">{t("pts.unit")}</span>
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {t("pts.totals")
                  .replace("{earned}", String(account.earnedTotal))
                  .replace("{spent}", String(account.spentTotal))}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleClaimDaily}
                  disabled={claimBusy || dailyClaimed}
                  className="rounded-full bg-accent-primary px-4 py-2 text-sm font-semibold text-on-accent hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {dailyClaimed ? t("pts.claimedButton") : t("pts.claimButton")}
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-surface-1 p-6">
              <h2 className="text-lg font-semibold text-text-primary">{t("pts.earnTitle")}</h2>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary list-disc list-inside">
                <li>{t("pts.earnSession")}</li>
                <li>{t("pts.earnDaily")}</li>
                <li>{t("pts.earnStreak")}</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-text-primary">{t("pts.shopTitle")}</h2>
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
                        className="rounded-2xl border border-border bg-surface-1 p-4 flex flex-col gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-text-primary">{item.name}</h3>
                            {item.description && (
                              <p className="text-xs text-text-secondary mt-1">{item.description}</p>
                            )}
                          </div>
                          <span className="shrink-0 rounded-full bg-accent-primary/15 px-2.5 py-1 text-xs font-bold text-accent-soft">
                            {item.costPoints} {t("pts.unit")}
                          </span>
                        </div>
                        <p className="text-xs text-text-tertiary">
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
                              ? "bg-accent-primary text-on-accent hover:brightness-110"
                              : "bg-surface-3 text-text-tertiary"
                          )}
                        >
                          {redeemBusyId === item.id ? t("pts.redeeming") : t("pts.redeemButton")}
                        </button>
                        {confirmingId === item.id && (
                          <div className="rounded-xl border border-accent-primary/30 bg-accent-primary/10 p-3 text-xs space-y-2">
                            <p className="text-text-primary">
                              {t("pts.confirmRedeem")
                                .replace("{cost}", String(item.costPoints))
                                .replace("{name}", item.name)}
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleRedeem(item.id)}
                                className="rounded-full bg-accent-primary px-3 py-1.5 font-semibold text-on-accent hover:brightness-110"
                              >
                                {t("pts.confirmYes")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingId(null)}
                                className="rounded-full border border-border px-3 py-1.5 font-semibold text-text-secondary hover:bg-surface-2"
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
              <section className="rounded-2xl border border-border bg-surface-1 p-6">
                <h2 className="text-lg font-semibold text-text-primary">{t("pts.redemptionsTitle")}</h2>
                <ul className="mt-3 divide-y divide-border">
                  {redemptions.map((row) => (
                    <li key={row.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-text-primary">{row.itemName}</span>
                      <span className="text-xs text-text-tertiary">
                        −{row.costPoints} {t("pts.unit")} · {formatWhen(row.grantedAt, lang)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-surface-1 p-6">
              <h2 className="text-lg font-semibold text-text-primary">{t("pts.ledgerTitle")}</h2>
              {ledger.length === 0 ? (
                <EmptyState
                  title={t("pts.ledgerEmpty")}
                  description={t("pts.ledgerEmptyDesc")}
                  action={{ href: "/dashboard", label: t("pts.backHome") }}
                />
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {ledger.map((row) => (
                    <li key={row.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-text-primary">
                        {t((REASON_LABEL_KEYS[row.reason] || "pts.reasonAdmin") as I18nKey)}
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className={cx(
                            "font-semibold",
                            row.delta >= 0 ? "text-success" : "text-danger"
                          )}
                        >
                          {row.delta >= 0 ? `+${row.delta}` : row.delta}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {formatWhen(row.createdAt, lang)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {actionNotice && (
              <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                {actionNotice}
              </p>
            )}
            {actionError && (
              <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                {actionError}
              </p>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
