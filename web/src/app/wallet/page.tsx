"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { apiFetch, ApiError } from "@/lib/api";
import { localeFor, type I18nKey, type UiLanguage } from "@/lib/i18n";
import { cx } from "@/lib/cx";
import { Button, Card, ErrorState, Input, LoadingSkeleton, PageShell } from "@/components";

// Jetons wallet (medspark.online Sparx-wallet parity): balance, three ways to
// top up (online / CCP-BaridiMob receipt / recharge code), and the ledger.
// Prices always come from GET /api/wallet — never hard-coded here.

interface Pack {
  id: string;
  label: string;
  jetons: number;
  bonusJetons: number;
  priceDzd: number;
  badge: "recommended" | "best_value" | null;
}

interface WalletState {
  balance: number;
  pricing: { dzdPerJeton: number; customMin: number; customMax: number };
  packs: Pack[];
  methods: {
    online: boolean;
    transfer: { ccpAccount: string | null; ccpKey: string | null; rip: string | null; beneficiary: string } | null;
    receiptUpload: boolean;
  };
  contacts: { telegram: string | null; instagram: string | null; facebook: string | null };
}

interface LedgerRow {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
}

interface DepositRow {
  id: string;
  amountDzd: number | null;
  status: "pending" | "approved" | "rejected";
  jetonsGranted: number | null;
  decisionNote: string | null;
  createdAt: string;
}

type Tab = "online" | "transfer" | "code";

const REASON_KEYS: Record<string, I18nKey> = {
  topup_online: "wal.reasonOnline",
  topup_transfer: "wal.reasonTransfer",
  topup_code: "wal.reasonCode",
  resource_purchase: "wal.reasonPurchase",
  admin_adjust: "wal.reasonAdmin",
};

const DEPOSIT_KEYS: Record<DepositRow["status"], I18nKey> = {
  pending: "wal.depositPending",
  approved: "wal.depositApproved",
  rejected: "wal.depositRejected",
};

const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatDzd(value: number, lang: UiLanguage): string {
  return new Intl.NumberFormat(localeFor(lang)).format(value);
}

function formatWhen(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleString(localeFor(lang), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-control border border-border bg-surface-2 px-4 py-3">
      <div className="min-w-0">
        <p className="text-caption font-medium uppercase tracking-wide text-text-secondary">{label}</p>
        <p className="truncate font-mono text-body font-semibold text-text-primary">{display ?? value}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => void copy()}>
        {copied ? t("wal.copied") : t("wal.copy")}
      </Button>
    </div>
  );
}

function WalletContent() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { lang, t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returningOrderId = searchParams.get("order");

  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [deposits, setDeposits] = useState<DepositRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("online");
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);

  const [busyPackId, setBusyPackId] = useState<string | null>(null);
  const [customJetons, setCustomJetons] = useState("");
  const [amountDzd, setAmountDzd] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canFetch = isHydrated && !!user;

  const load = useCallback(async () => {
    const walletData = await apiFetch<WalletState>("/wallet");
    const ledgerData = await apiFetch<{ ledger: LedgerRow[] }>("/wallet/ledger?limit=30");
    const depositData = await apiFetch<{ deposits: DepositRow[] }>("/wallet/transfer-deposits");
    setWallet(walletData);
    setLedger(ledgerData.ledger);
    setDeposits(depositData.deposits);
  }, []);

  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await load();
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err, t("wal.loadFailed")));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canFetch, load, t]);

  // Back from the hosted checkout: ask the API for the order's truth, polling
  // briefly while the provider is still settling it.
  useEffect(() => {
    if (!canFetch || !returningOrderId) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 5 && !cancelled; attempt += 1) {
        try {
          const result = await apiFetch<{ order: { status: string; jetons: number }; balance: number }>(
            `/wallet/checkout/${returningOrderId}/confirm`,
            { method: "POST" }
          );
          if (cancelled) return;
          if (result.order.status === "paid") {
            setNotice({ kind: "success", text: t("wal.orderPaid", { n: result.order.jetons }) });
            await load();
            break;
          }
          if (result.order.status !== "pending") {
            setNotice({ kind: "error", text: t("wal.orderFailed") });
            break;
          }
          setNotice({ kind: "info", text: t("wal.orderPending") });
        } catch (err) {
          if (!cancelled) setNotice({ kind: "error", text: errorMessage(err, t("wal.actionFailed")) });
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (!cancelled) router.replace("/wallet");
    })();
    return () => {
      cancelled = true;
    };
  }, [canFetch, returningOrderId, load, router, t]);

  const previewRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function setReceiptFile(file: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = file ? URL.createObjectURL(file) : null;
    setReceipt(file);
    setReceiptPreview(previewRef.current);
  }

  async function refresh() {
    setNotice(null);
    try {
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, t("wal.loadFailed")) });
    }
  }

  async function startCheckout(body: { packId: string } | { jetons: number }, busyKey: string) {
    setNotice(null);
    setBusyPackId(busyKey);
    try {
      const result = await apiFetch<{ checkoutUrl: string }>("/wallet/checkout", {
        method: "POST",
        body: JSON.stringify(body),
      });
      window.location.assign(result.checkoutUrl);
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, t("wal.actionFailed")) });
      setBusyPackId(null);
    }
  }

  function pickReceipt(file: File | null) {
    setNotice(null);
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!RECEIPT_TYPES.includes(file.type)) {
      setNotice({ kind: "error", text: t("wal.receiptBadType") });
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      setNotice({ kind: "error", text: t("wal.receiptTooBig") });
      return;
    }
    setReceiptFile(file);
  }

  async function submitReceipt(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (!receipt) {
      setNotice({ kind: "error", text: t("wal.receiptRequired") });
      return;
    }
    setReceiptBusy(true);
    try {
      const receiptBase64 = await readAsDataUrl(receipt);
      const amount = Number.parseInt(amountDzd, 10);
      await apiFetch("/wallet/transfer-deposits", {
        method: "POST",
        body: JSON.stringify({ receiptBase64, amountDzd: Number.isFinite(amount) ? amount : null }),
      });
      setReceiptFile(null);
      setAmountDzd("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setNotice({ kind: "success", text: t("wal.receiptSent") });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, t("wal.actionFailed")) });
    } finally {
      setReceiptBusy(false);
    }
  }

  async function redeemCode(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setNotice(null);
    setCodeBusy(true);
    try {
      const result = await apiFetch<{ jetons: number }>("/wallet/recharge-codes/redeem", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      setCode("");
      setNotice({ kind: "success", text: t("wal.codeRedeemed", { n: result.jetons }) });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, t("wal.actionFailed")) });
    } finally {
      setCodeBusy(false);
    }
  }

  const custom = Number.parseInt(customJetons, 10);
  const customValid =
    !!wallet && Number.isInteger(custom) && custom >= wallet.pricing.customMin && custom <= wallet.pricing.customMax;
  const contacts: { name: string; href: string }[] = [];
  if (wallet?.contacts.telegram) contacts.push({ name: "Telegram", href: wallet.contacts.telegram });
  if (wallet?.contacts.instagram) contacts.push({ name: "Instagram", href: wallet.contacts.instagram });
  if (wallet?.contacts.facebook) contacts.push({ name: "Facebook", href: wallet.contacts.facebook });

  const tabs: { id: Tab; label: string }[] = [
    { id: "online", label: t("wal.tabOnline") },
    { id: "transfer", label: t("wal.tabTransfer") },
    { id: "code", label: t("wal.tabCode") },
  ];

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      title={t("wal.title")}
      description={t("wal.subtitle")}
      loadingLabel={t("common.loading")}
    >
      {isLoading && <LoadingSkeleton className="mt-section-gap h-64 w-full rounded-card" ariaLabel={t("common.loading")} />}
      {loadError && <ErrorState message={loadError} onRetry={() => void refresh()} className="mt-section-gap" />}

      {wallet && (
        <div className="mt-section-gap flex flex-col gap-section-gap" data-wallet>
          <Card radius="card-lg" accentTone="primary">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-meta font-medium uppercase tracking-wide text-text-secondary">{t("wal.balanceLabel")}</p>
                <p className="mt-1 font-display text-hero font-bold leading-none text-text-primary" data-wallet-balance>
                  {formatDzd(wallet.balance, lang)} <span className="text-h3 font-semibold text-text-secondary">{t("wal.unit")}</span>
                </p>
                <p className="mt-2 text-meta text-text-tertiary">{t("wal.rate", { dzd: wallet.pricing.dzdPerJeton })}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                {t("wal.refresh")}
              </Button>
            </div>
          </Card>

          {notice && (
            <p
              role={notice.kind === "error" ? "alert" : "status"}
              className={cx(
                "rounded-control border px-4 py-3 text-meta font-medium",
                notice.kind === "success" && "border-success text-text-primary",
                notice.kind === "error" && "border-danger text-danger",
                notice.kind === "info" && "border-border text-text-secondary"
              )}
            >
              {notice.text}
            </p>
          )}

          <section aria-labelledby="wallet-recharge">
            <h2 id="wallet-recharge" className="font-display text-h3 font-bold text-text-primary">
              {t("wal.rechargeTitle")}
            </h2>
            <div role="tablist" className="mt-3 grid grid-cols-3 gap-1 rounded-control border border-border bg-surface-2 p-1">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={cx(
                    "min-h-touch-target rounded-control px-2 text-meta font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                    tab === item.id ? "bg-surface-1 text-text-primary shadow-card" : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "online" && (
              <div role="tabpanel" className="mt-4 flex flex-col gap-card-gap">
                {!wallet.methods.online && (
                  <Card variant="elevated">
                    <p className="text-meta text-text-secondary">{t("wal.onlineUnavailable")}</p>
                  </Card>
                )}
                <ul className="grid grid-cols-1 gap-card-gap sm:grid-cols-3">
                  {wallet.packs.map((pack) => (
                    <Card
                      as="li"
                      key={pack.id}
                      className={cx("relative flex flex-col gap-3", pack.badge === "recommended" && "border-accent-primary")}
                    >
                      {pack.badge && (
                        <span className="absolute -top-3 left-4 rounded-full bg-accent-primary px-3 py-0.5 text-caption font-semibold text-on-accent">
                          {pack.badge === "recommended" ? t("wal.badgeRecommended") : t("wal.badgeBestValue")}
                        </span>
                      )}
                      <p className="font-display text-h2 font-bold text-text-primary">
                        {pack.jetons} <span className="text-body font-semibold text-text-secondary">{t("wal.unit")}</span>
                      </p>
                      {pack.bonusJetons > 0 && (
                        <p className="text-meta font-semibold text-success">{t("wal.bonus", { n: pack.bonusJetons })}</p>
                      )}
                      <p className="text-h3 font-bold text-text-primary">
                        {formatDzd(pack.priceDzd, lang)} <span className="text-meta font-semibold text-text-secondary">DA</span>
                      </p>
                      <Button
                        width="full"
                        disabled={!wallet.methods.online || busyPackId !== null}
                        onClick={() => void startCheckout({ packId: pack.id }, pack.id)}
                      >
                        {busyPackId === pack.id ? t("wal.paying") : t("wal.pay")}
                      </Button>
                    </Card>
                  ))}
                </ul>
                <Card>
                  <h3 className="text-body font-semibold text-text-primary">{t("wal.customTitle")}</h3>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <Input
                      id="wallet-custom"
                      type="number"
                      inputMode="numeric"
                      min={wallet.pricing.customMin}
                      max={wallet.pricing.customMax}
                      label={t("wal.unit")}
                      placeholder={t("wal.customPlaceholder")}
                      hint={t("wal.customHint", { min: wallet.pricing.customMin, max: wallet.pricing.customMax })}
                      value={customJetons}
                      onChange={(e) => setCustomJetons(e.target.value)}
                      fieldClassName="flex-1"
                    />
                    <p className="text-body font-semibold text-text-primary sm:pb-8">
                      ≈ {formatDzd(customValid ? custom * wallet.pricing.dzdPerJeton : 0, lang)} DA
                    </p>
                    <Button
                      className="sm:mb-7"
                      disabled={!wallet.methods.online || !customValid || busyPackId !== null}
                      onClick={() => void startCheckout({ jetons: custom }, "custom")}
                    >
                      {busyPackId === "custom" ? t("wal.paying") : t("wal.pay")}
                    </Button>
                  </div>
                </Card>
                {wallet.methods.online && <p className="text-caption text-text-tertiary">{t("wal.onlineNote")}</p>}
              </div>
            )}

            {tab === "transfer" && (
              <div role="tabpanel" className="mt-4 flex flex-col gap-card-gap">
                {!wallet.methods.transfer ? (
                  <Card variant="elevated">
                    <p className="text-meta text-text-secondary">{t("wal.transferUnavailable")}</p>
                  </Card>
                ) : (
                  <>
                    <Card>
                      <h3 className="text-body font-semibold text-text-primary">{t("wal.transferTitle")}</h3>
                      <div className="mt-3 flex flex-col gap-2">
                        {wallet.methods.transfer.rip && <CopyRow label={t("wal.rip")} value={wallet.methods.transfer.rip} />}
                        {wallet.methods.transfer.ccpAccount && (
                          <CopyRow
                            label={t("wal.ccp")}
                            value={wallet.methods.transfer.ccpAccount}
                            display={
                              wallet.methods.transfer.ccpKey
                                ? `${wallet.methods.transfer.ccpAccount} / ${t("wal.ccpKey", { key: wallet.methods.transfer.ccpKey })}`
                                : wallet.methods.transfer.ccpAccount
                            }
                          />
                        )}
                      </div>
                      <p className="mt-3 text-meta text-text-secondary">
                        {t("wal.beneficiary", { name: wallet.methods.transfer.beneficiary })}
                      </p>
                    </Card>
                    <Card as="section">
                      <h3 className="text-body font-semibold text-text-primary">{t("wal.sendReceiptTitle")}</h3>
                      {!wallet.methods.receiptUpload ? (
                        <p className="mt-2 text-meta text-text-secondary">{t("wal.receiptUploadUnavailable")}</p>
                      ) : (
                        <form className="mt-3 flex flex-col gap-3" onSubmit={(e) => void submitReceipt(e)}>
                          <Input
                            id="wallet-amount"
                            type="number"
                            inputMode="numeric"
                            min={wallet.pricing.dzdPerJeton}
                            label={t("wal.amountLabel")}
                            value={amountDzd}
                            onChange={(e) => setAmountDzd(e.target.value)}
                          />
                          <label
                            htmlFor="wallet-receipt"
                            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-border bg-surface-2 p-card-padding text-center transition hover:border-border-strong"
                          >
                            {receiptPreview ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={receiptPreview} alt={t("wal.receiptLabel")} className="max-h-64 rounded-control object-contain" />
                            ) : (
                              <span className="text-body font-medium text-text-primary">{t("wal.receiptLabel")}</span>
                            )}
                            <span className="text-caption text-text-tertiary">{t("wal.receiptHint")}</span>
                          </label>
                          <input
                            ref={fileInputRef}
                            id="wallet-receipt"
                            type="file"
                            accept={RECEIPT_TYPES.join(",")}
                            className="sr-only"
                            onChange={(e) => pickReceipt(e.target.files?.[0] ?? null)}
                          />
                          <Button type="submit" disabled={receiptBusy}>
                            {receiptBusy ? t("wal.submitting") : t("wal.submitReceipt")}
                          </Button>
                        </form>
                      )}
                    </Card>
                  </>
                )}
                {deposits.length > 0 && (
                  <Card as="section">
                    <h3 className="text-body font-semibold text-text-primary">{t("wal.myReceipts")}</h3>
                    <ul className="mt-2 divide-y divide-border">
                      {deposits.map((deposit) => (
                        <li key={deposit.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-meta">
                          <span className="text-text-primary">
                            {deposit.amountDzd ? `${formatDzd(deposit.amountDzd, lang)} DA · ` : ""}
                            {formatWhen(deposit.createdAt, lang)}
                          </span>
                          <span
                            className={cx(
                              "font-semibold",
                              deposit.status === "approved" && "text-success",
                              deposit.status === "rejected" && "text-danger",
                              deposit.status === "pending" && "text-text-secondary"
                            )}
                          >
                            {t(DEPOSIT_KEYS[deposit.status])}
                            {deposit.jetonsGranted ? ` · ${t("wal.depositGranted", { n: deposit.jetonsGranted })}` : ""}
                          </span>
                          {deposit.decisionNote && (
                            <span className="w-full text-caption text-text-tertiary">{deposit.decisionNote}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            )}

            {tab === "code" && (
              <div role="tabpanel" className="mt-4 flex flex-col gap-card-gap">
                <Card as="section">
                  <h3 className="text-body font-semibold text-text-primary">{t("wal.codeTitle")}</h3>
                  <form className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => void redeemCode(e)}>
                    <Input
                      id="wallet-code"
                      label={t("wal.codeLabel")}
                      placeholder="HJ-XXXXXXXXXXXXXXXX"
                      autoComplete="off"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      fieldClassName="flex-1"
                      className="font-mono uppercase"
                    />
                    <Button type="submit" disabled={codeBusy || !code.trim()}>
                      {t("wal.codeSubmit")}
                    </Button>
                  </form>
                </Card>
                <Card as="section">
                  <h3 className="text-body font-semibold text-text-primary">{t("wal.buyCodeTitle")}</h3>
                  {contacts.length === 0 ? (
                    <p className="mt-2 text-meta text-text-secondary">{t("wal.noContacts")}</p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                      {contacts.map(({ name, href }) => (
                        <li key={name}>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex min-h-touch-target items-center justify-between rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                          >
                            <span>{name}</span>
                            <span className="text-meta text-text-secondary">{t("wal.contact")} →</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            )}
          </section>

          <Card as="section">
            <h2 className="font-display text-h3 font-bold text-text-primary">{t("wal.historyTitle")}</h2>
            {ledger.length === 0 ? (
              <p className="mt-2 text-meta text-text-secondary">{t("wal.historyEmpty")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border" data-wallet-ledger>
                {ledger.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-meta">
                    <span className="text-text-primary">{t(REASON_KEYS[row.reason] ?? "wal.reasonAdmin")}</span>
                    <span className="flex items-center gap-3">
                      <span className={cx("font-semibold", row.delta >= 0 ? "text-success" : "text-danger")}>
                        {row.delta >= 0 ? `+${row.delta}` : row.delta}
                      </span>
                      <span className="text-caption text-text-tertiary">{formatWhen(row.createdAt, lang)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </PageShell>
  );
}

export default function WalletPage() {
  const { t } = useLanguage();
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-card-padding">
          <LoadingSkeleton className="h-8 w-48" ariaLabel={t("common.loading")} />
        </main>
      }
    >
      <WalletContent />
    </Suspense>
  );
}
