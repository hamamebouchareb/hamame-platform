"use client";

import { useMemo, useState } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageShell,
} from "@/components";
import { Select } from "@/components/Field";

// Creator payout queue (manual bridge): read the queue, approve/reject a
// pending request, or mark an approved one paid. Transitions are enforced
// server-side (pending → approved|rejected, approved → paid).

interface PayoutRow {
  id: string;
  requestedBy: string;
  university: string | null;
  amountDzd: number;
  method: string;
  status: "pending" | "approved" | "rejected" | "paid";
  note: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

const STATUS_FILTERS = ["pending", "approved", "rejected", "paid"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type PayoutStatusT =
  | "pay.statusPending"
  | "pay.statusApproved"
  | "pay.statusRejected"
  | "pay.statusPaid";

function payoutStatusLabel(status: string, t: (key: PayoutStatusT) => string): string {
  switch (status) {
    case "pending":
      return t("pay.statusPending");
    case "approved":
      return t("pay.statusApproved");
    case "rejected":
      return t("pay.statusRejected");
    case "paid":
      return t("pay.statusPaid");
    default:
      return status;
  }
}

function canManagePayouts(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.includes("admin") || roles.includes("super_admin");
}

export default function AdminPayoutsPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;
  const allowed = canManagePayouts(user?.roles);

  const [statusFilter, setStatusFilter] = useState<StatusFilter | "">("");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const {
    data,
    error,
    isLoading,
    refetch,
  } = useApiResource<{ requests: PayoutRow[]; pagination: { total: number } }>(
    allowed && canFetch ? `/payouts/admin${statusFilter ? `?status=${statusFilter}` : ""}` : null
  );
  const rows = useMemo(() => data?.requests ?? [], [data]);

  async function decide(id: string, action: "approve" | "reject" | "mark-paid") {
    setNotice(null);
    setDecidingId(id);
    try {
      await apiFetch(`/payouts/admin/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setNotice(t("admin.payoutDecideDone"));
      refetch();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setDecidingId(null);
    }
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("admin.payoutsTitle")}
      loadingLabel={t("common.loading")}
    >
      {!allowed ? (
        <EmptyState title={t("admin.payoutsDenied")} description={t("admin.deniedDesc")} action={{ label: t("classement.backToDashboard"), href: "/dashboard" }} />
      ) : (
        <>
          <div className="mt-section-gap max-w-56">
            <Select
              id="admin-payout-filter"
              label={t("admin.payoutStatus")}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter | "")}
            >
              <option value="">{t("admin.payoutAll")}</option>
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>{payoutStatusLabel(s, t)}</option>
              ))}
            </Select>
          </div>

          {isLoading && <LoadingSkeleton className="mt-4 h-5 w-48" ariaLabel={t("common.loading")} />}
          {error && <ErrorState message={error} onRetry={refetch} className="mt-4" />}

          {notice && (
            <Card className="mt-4 border-success">
              <p className="text-meta font-medium text-text-primary">{notice}</p>
            </Card>
          )}

          {!isLoading && !error && rows.length === 0 && (
            <p className="mt-4 text-meta text-text-secondary">{t("admin.payoutsEmptyDesc")}</p>
          )}

          <ul className="mt-4 flex flex-col gap-card-gap">
            {rows.map((row) => (
              <Card as="li" key={row.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body font-semibold text-text-primary">
                    {row.amountDzd.toLocaleString("fr-DZ")} DZD · {row.requestedBy}
                    {row.university ? ` · ${row.university}` : ""}
                  </p>
                  <p className="text-caption text-text-secondary">{payoutStatusLabel(row.status, t)}</p>
                </div>
                <p className="mt-1 text-caption text-text-tertiary">
                  {new Date(row.createdAt).toLocaleDateString()} · {row.method}
                  {row.decidedAt && row.decidedBy
                    ? ` · ${t("admin.payoutDecidedBy")}: ${row.decidedBy} (${new Date(row.decidedAt).toLocaleDateString()})`
                    : ""}
                </p>
                {row.note && (
                  <p className="mt-2 text-meta text-text-secondary">
                    {t("admin.payoutNote")}: {row.note}
                  </p>
                )}
                {row.decisionNote && (
                  <p className="mt-1 text-caption text-text-tertiary">
                    {t("admin.payoutNote")} (décision): {row.decisionNote}
                  </p>
                )}
                {row.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => void decide(row.id, "approve")}
                      disabled={decidingId === row.id}
                    >
                      {t("admin.payoutApprove")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void decide(row.id, "reject")}
                      disabled={decidingId === row.id}
                    >
                      {t("admin.payoutReject")}
                    </Button>
                  </div>
                )}
                {row.status === "approved" && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      onClick={() => void decide(row.id, "mark-paid")}
                      disabled={decidingId === row.id}
                    >
                      {t("admin.payoutMarkPaid")}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </ul>
        </>
      )}
    </PageShell>
  );
}
