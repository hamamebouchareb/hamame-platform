"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import type { I18nKey } from "@/lib/i18n";
import { Button, Card, EmptyState, ErrorState, Input, LoadingSkeleton, PageShell } from "@/components";
import { Select } from "@/components/Field";

// Staff side of the jetons wallet: decide CCP/BaridiMob receipts, issue and
// revoke recharge codes; admins additionally edit pack prices and resource
// prices. Every transition is enforced server-side (conditional updates).

interface DepositRow {
  id: string;
  userName: string | null;
  userEmail: string | null;
  amountDzd: number | null;
  status: "pending" | "approved" | "rejected";
  jetonsGranted: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

interface CodeRow {
  id: string;
  code: string;
  jetons: number;
  status: "active" | "redeemed" | "revoked";
  issuedAt: string;
  redeemedBy: string | null;
  redeemedByEmail: string | null;
}

interface PackRow {
  id: string;
  label: string;
  jetons: number;
  priceDzd: number;
  isActive: boolean;
}

interface ResourceRow {
  id: string;
  title: string;
  priceJetons: number;
}

const DEPOSIT_FILTERS = ["pending", "approved", "rejected"] as const;
const CODE_FILTERS = ["active", "redeemed", "revoked"] as const;

const DEPOSIT_KEYS: Record<DepositRow["status"], I18nKey> = {
  pending: "wal.depositPending",
  approved: "wal.depositApproved",
  rejected: "wal.depositRejected",
};

const CODE_KEYS: Record<CodeRow["status"], I18nKey> = {
  active: "wal.codeStatusActive",
  redeemed: "wal.codeStatusRedeemed",
  revoked: "wal.codeStatusRevoked",
};

function hasAny(roles: string[] | undefined, names: string[]): boolean {
  return !!roles && roles.some((role) => names.includes(role));
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function DepositCard({ row, onDone }: { row: DepositRow; onDone: (message: string) => void }) {
  const { t } = useLanguage();
  const [jetons, setJetons] = useState(row.amountDzd ? String(Math.floor(row.amountDzd / 10)) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function viewReceipt() {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>(`/wallet/admin/transfer-deposits/${row.id}/receipt`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(errorText(err, t("wal.actionFailed")));
    }
  }

  async function decide(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const amount = Number.parseInt(jetons, 10);
      await apiFetch(`/wallet/admin/transfer-deposits/${row.id}/decide`, {
        method: "POST",
        body: JSON.stringify({
          action,
          ...(action === "approve" ? { jetons: amount } : {}),
          decisionNote: note.trim() || null,
        }),
      });
      onDone(t("wal.adminDone"));
    } catch (err) {
      setError(errorText(err, t("wal.actionFailed")));
    } finally {
      setBusy(false);
    }
  }

  const amountValid = Number.isInteger(Number.parseInt(jetons, 10)) && Number.parseInt(jetons, 10) > 0;

  return (
    <Card as="li">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body font-semibold text-text-primary">
          {row.userName ?? "—"} · {row.userEmail ?? "—"}
        </p>
        <p className="text-caption text-text-secondary">{t(DEPOSIT_KEYS[row.status])}</p>
      </div>
      <p className="mt-1 text-caption text-text-tertiary">
        {new Date(row.createdAt).toLocaleString()}
        {row.amountDzd ? ` · ${t("wal.adminDeclared", { amount: row.amountDzd.toLocaleString("fr-DZ") })}` : ""}
        {row.jetonsGranted ? ` · ${t("wal.depositGranted", { n: row.jetonsGranted })}` : ""}
        {row.decidedBy ? ` · ${row.decidedBy}` : ""}
      </p>
      {row.decisionNote && <p className="mt-1 text-meta text-text-secondary">{row.decisionNote}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void viewReceipt()}>
          {t("wal.adminViewReceipt")}
        </Button>
      </div>
      {row.status === "pending" && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <Input
            id={`jetons-${row.id}`}
            type="number"
            min={1}
            label={t("wal.adminJetonsToGrant")}
            value={jetons}
            onChange={(e) => setJetons(e.target.value)}
          />
          <Input id={`note-${row.id}`} label={t("wal.adminNote")} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2 sm:mb-1">
            <Button size="sm" onClick={() => void decide("approve")} disabled={busy || !amountValid}>
              {t("wal.adminApprove")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void decide("reject")} disabled={busy}>
              {t("wal.adminReject")}
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-meta text-danger">{error}</p>}
    </Card>
  );
}

function PackEditor({ pack, onSaved }: { pack: PackRow; onSaved: (message: string) => void }) {
  const { t } = useLanguage();
  const [price, setPrice] = useState(String(pack.priceDzd));
  const [jetons, setJetons] = useState(String(pack.jetons));
  const [active, setActive] = useState(pack.isActive);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiFetch(`/wallet/admin/packs/${pack.id}`, {
        method: "PATCH",
        body: JSON.stringify({ priceDzd: Number(price), jetons: Number(jetons), isActive: active }),
      });
      onSaved(t("wal.adminSaved"));
    } catch (err) {
      setError(errorText(err, t("wal.actionFailed")));
    }
  }

  return (
    <Card as="li">
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_8rem_auto_auto] sm:items-end" onSubmit={(e) => void save(e)}>
        <p className="text-body font-semibold text-text-primary sm:mb-3">{pack.label}</p>
        <Input id={`pack-jetons-${pack.id}`} type="number" min={1} label={t("wal.adminPackJetons")} value={jetons} onChange={(e) => setJetons(e.target.value)} />
        <Input id={`pack-price-${pack.id}`} type="number" min={50} label={t("wal.adminPackPrice")} value={price} onChange={(e) => setPrice(e.target.value)} />
        <label className="flex min-h-touch-target items-center gap-2 text-meta text-text-primary sm:mb-1">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t("wal.adminPackActive")}
        </label>
        <Button size="sm" type="submit" className="sm:mb-1">
          {t("wal.adminPackSave")}
        </Button>
      </form>
      {error && <p role="alert" className="mt-2 text-meta text-danger">{error}</p>}
    </Card>
  );
}

function ResourcePriceRow({ resource, onSaved }: { resource: ResourceRow; onSaved: (message: string) => void }) {
  const { t } = useLanguage();
  const [price, setPrice] = useState(String(resource.priceJetons));
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await apiFetch(`/resources/${resource.id}/price`, {
        method: "PATCH",
        body: JSON.stringify({ priceJetons: Number(price) }),
      });
      onSaved(t("wal.adminSaved"));
    } catch (err) {
      setError(errorText(err, t("wal.actionFailed")));
    }
  }

  return (
    <li className="py-2">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void save(e)}>
        <p className="min-w-0 flex-1 truncate text-body text-text-primary sm:mb-3">{resource.title}</p>
        <Input
          id={`resource-price-${resource.id}`}
          type="number"
          min={0}
          label={t("wal.unit")}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          fieldClassName="w-32"
        />
        <Button size="sm" type="submit" className="mb-1">
          {t("wal.adminPackSave")}
        </Button>
      </form>
      {error && <p role="alert" className="mt-1 text-meta text-danger">{error}</p>}
    </li>
  );
}

export default function AdminWalletPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;
  const isStaff = hasAny(user?.roles, ["support_agent", "admin", "super_admin"]);
  const isAdmin = hasAny(user?.roles, ["admin", "super_admin"]);

  const [depositFilter, setDepositFilter] = useState<(typeof DEPOSIT_FILTERS)[number] | "">("pending");
  const [codeFilter, setCodeFilter] = useState<(typeof CODE_FILTERS)[number] | "">("");
  const [notice, setNotice] = useState<string | null>(null);
  const [codeJetons, setCodeJetons] = useState("100");
  const [codeCount, setCodeCount] = useState("1");
  const [issued, setIssued] = useState<string[]>([]);
  const [issueError, setIssueError] = useState<string | null>(null);

  const deposits = useApiResource<{ deposits: DepositRow[] }>(
    isStaff && canFetch ? `/wallet/admin/transfer-deposits?limit=50${depositFilter ? `&status=${depositFilter}` : ""}` : null
  );
  const codes = useApiResource<{ codes: CodeRow[] }>(
    isStaff && canFetch ? `/wallet/admin/recharge-codes?limit=50${codeFilter ? `&status=${codeFilter}` : ""}` : null
  );
  const packs = useApiResource<{ packs: PackRow[] }>(isAdmin && canFetch ? "/wallet/admin/packs" : null);
  const resources = useApiResource<{ resources: ResourceRow[] }>(isAdmin && canFetch ? "/resources" : null);

  const depositRows = useMemo(() => deposits.data?.deposits ?? [], [deposits.data]);
  const codeRows = useMemo(() => codes.data?.codes ?? [], [codes.data]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function issueCodes(event: FormEvent) {
    event.preventDefault();
    setIssueError(null);
    try {
      const result = await apiFetch<{ codes: { code: string }[] }>("/wallet/admin/recharge-codes", {
        method: "POST",
        body: JSON.stringify({ jetons: Number(codeJetons), count: Number(codeCount) }),
      });
      setIssued(result.codes.map((c) => c.code));
      setNotice(t("wal.adminIssued", { n: result.codes.length }));
      codes.refetch();
    } catch (err) {
      setIssueError(errorText(err, t("wal.actionFailed")));
    }
  }

  async function revoke(id: string) {
    try {
      await apiFetch(`/wallet/admin/recharge-codes/${id}/revoke`, { method: "POST" });
      codes.refetch();
    } catch (err) {
      setNotice(errorText(err, t("wal.actionFailed")));
    }
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      title={t("wal.adminTitle")}
      loadingLabel={t("common.loading")}
    >
      {!isStaff ? (
        <EmptyState
          title={t("wal.adminDenied")}
          description={t("admin.deniedDesc")}
          action={{ label: t("classement.backToDashboard"), href: "/dashboard" }}
        />
      ) : (
        <div className="mt-section-gap flex flex-col gap-section-gap">
          {notice && (
            <p role="status" className="rounded-control border border-success px-4 py-3 text-meta font-medium text-text-primary">
              {notice}
            </p>
          )}

          <section aria-labelledby="admin-wallet-receipts">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="admin-wallet-receipts" className="font-display text-h3 font-bold text-text-primary">
                {t("wal.adminReceipts")}
              </h2>
              <div className="w-48">
                <Select
                  id="admin-wallet-deposit-filter"
                  label={t("admin.payoutStatus")}
                  value={depositFilter}
                  onChange={(e) => setDepositFilter(e.target.value as typeof depositFilter)}
                >
                  <option value="">{t("wal.statusAll")}</option>
                  {DEPOSIT_FILTERS.map((s) => (
                    <option key={s} value={s}>{t(DEPOSIT_KEYS[s])}</option>
                  ))}
                </Select>
              </div>
            </div>
            {deposits.isLoading && <LoadingSkeleton className="mt-4 h-5 w-48" ariaLabel={t("common.loading")} />}
            {deposits.error && <ErrorState message={deposits.error} onRetry={deposits.refetch} className="mt-4" />}
            {!deposits.isLoading && !deposits.error && depositRows.length === 0 && (
              <p className="mt-4 text-meta text-text-secondary">{t("wal.adminReceiptsEmpty")}</p>
            )}
            <ul className="mt-4 flex flex-col gap-card-gap">
              {depositRows.map((row) => (
                <DepositCard
                  key={row.id}
                  row={row}
                  onDone={(message) => {
                    setNotice(message);
                    deposits.refetch();
                  }}
                />
              ))}
            </ul>
          </section>

          <section aria-labelledby="admin-wallet-codes">
            <h2 id="admin-wallet-codes" className="font-display text-h3 font-bold text-text-primary">
              {t("wal.adminCodes")}
            </h2>
            <Card className="mt-4">
              <form className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={(e) => void issueCodes(e)}>
                <Input id="code-jetons" type="number" min={1} label={t("wal.adminCodeJetons")} value={codeJetons} onChange={(e) => setCodeJetons(e.target.value)} />
                <Input id="code-count" type="number" min={1} max={50} label={t("wal.adminCodeCount")} value={codeCount} onChange={(e) => setCodeCount(e.target.value)} />
                <Button type="submit" className="sm:mb-1">{t("wal.adminIssue")}</Button>
              </form>
              {issueError && <p role="alert" className="mt-2 text-meta text-danger">{issueError}</p>}
              {issued.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 font-mono text-meta text-text-primary" data-issued-codes>
                  {issued.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </Card>
            <div className="mt-4 w-48">
              <Select
                id="admin-wallet-code-filter"
                label={t("admin.payoutStatus")}
                value={codeFilter}
                onChange={(e) => setCodeFilter(e.target.value as typeof codeFilter)}
              >
                <option value="">{t("wal.statusAll")}</option>
                {CODE_FILTERS.map((s) => (
                  <option key={s} value={s}>{t(CODE_KEYS[s])}</option>
                ))}
              </Select>
            </div>
            {codes.error && <ErrorState message={codes.error} onRetry={codes.refetch} className="mt-4" />}
            {!codes.isLoading && !codes.error && codeRows.length === 0 && (
              <p className="mt-4 text-meta text-text-secondary">{t("wal.adminCodesEmpty")}</p>
            )}
            <ul className="mt-4 divide-y divide-border rounded-card border border-border bg-surface-1 px-card-padding">
              {codeRows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-meta">
                  <span className="font-mono text-text-primary">{row.code}</span>
                  <span className="text-text-secondary">
                    {t("wal.priceTag", { n: row.jetons })} · {t(CODE_KEYS[row.status])}
                    {row.redeemedBy ? ` · ${t("wal.redeemedBy", { name: row.redeemedBy })}` : ""}
                  </span>
                  {row.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => void revoke(row.id)}>
                      {t("wal.adminRevoke")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {isAdmin && (
            <section aria-labelledby="admin-wallet-packs">
              <h2 id="admin-wallet-packs" className="font-display text-h3 font-bold text-text-primary">
                {t("wal.adminPacks")}
              </h2>
              {packs.error && <ErrorState message={packs.error} onRetry={packs.refetch} className="mt-4" />}
              <ul className="mt-4 flex flex-col gap-card-gap">
                {(packs.data?.packs ?? []).map((pack) => (
                  <PackEditor key={pack.id} pack={pack} onSaved={(m) => { setNotice(m); packs.refetch(); }} />
                ))}
              </ul>
            </section>
          )}

          {isAdmin && (
            <section aria-labelledby="admin-wallet-resources">
              <h2 id="admin-wallet-resources" className="font-display text-h3 font-bold text-text-primary">
                {t("wal.adminResources")}
              </h2>
              <p className="mt-1 text-meta text-text-secondary">{t("wal.adminPriceHint")}</p>
              {resources.error && <ErrorState message={resources.error} onRetry={resources.refetch} className="mt-4" />}
              <ul className="mt-4 divide-y divide-border rounded-card border border-border bg-surface-1 px-card-padding">
                {(resources.data?.resources ?? []).map((resource) => (
                  <ResourcePriceRow key={resource.id} resource={resource} onSaved={(m) => setNotice(m)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}
