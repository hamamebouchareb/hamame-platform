"use client";

import { useMemo, useState } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageShell,
} from "@/components";
import { Input, Select } from "@/components/Field";

interface ReportItem {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  severity: string;
  status: string;
  createdAt: string;
  reporter: { fullName: string | null };
  snippet?: string;
}

interface QueueResponse {
  items: ReportItem[];
  pagination: { page: number; limit: number; total: number };
}

function canModerate(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.includes("moderator") || roles.includes("admin") || roles.includes("super_admin");
}

export default function AdminReportsPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;
  const allowed = canModerate(user?.roles);

  const { data, error, isLoading, refetch } = useApiResource<QueueResponse>(
    allowed && canFetch ? "/moderation/queue?limit=20" : null
  );
  const items = useMemo(() => data?.items ?? [], [data]);

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState<string>("resolved");
  const [note, setNote] = useState("");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [restrictId, setRestrictId] = useState("");
  const [restrictDays, setRestrictDays] = useState("1");
  const [restrictReason, setRestrictReason] = useState("");
  const [confirmRestrict, setConfirmRestrict] = useState(false);

  async function handleResolve() {
    if (!resolvingId) return;
    setActionError(null);
    setWorking(true);
    try {
      await apiFetch(`/moderation/reports/${resolvingId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      setResolvingId(null);
      setNote("");
      refetch();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setWorking(false);
    }
  }

  async function handleRestrict() {
    setActionError(null);
    setWorking(true);
    try {
      const days = Number(restrictDays);
      await apiFetch(`/moderation/users/${restrictId.trim()}/restrict`, {
        method: "POST",
        body: JSON.stringify({
          reason: restrictReason.trim(),
          ...(Number.isInteger(days) && days >= 1 ? { durationDays: days } : {}),
        }),
      });
      setConfirmRestrict(false);
      setRestrictId("");
      setRestrictReason("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setWorking(false);
    }
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("admin.reports")}
      loadingLabel={t("common.loading")}
    >
      {!allowed ? (
        <EmptyState title={t("admin.denied")} description={t("admin.deniedDesc")} action={{ label: t("classement.backToDashboard"), href: "/dashboard" }} />
      ) : (
        <>
          <h2 className="mt-section-gap font-display text-h3 font-semibold text-text-primary">{t("admin.reportsQueue")}</h2>

          {isLoading && <LoadingSkeleton className="mt-4 h-5 w-48" ariaLabel={t("common.loading")} />}
          {error && <ErrorState message={error} onRetry={refetch} className="mt-4" />}

          {!isLoading && !error && items.length === 0 && (
            <p className="mt-4 text-meta text-text-secondary">{t("admin.reportsEmpty")}</p>
          )}

          <ul className="mt-4 flex flex-col gap-card-gap">
            {items.map((item) => (
              <Card as="li" key={item.id}>
                <p className="text-body font-medium text-text-primary">{item.reason}</p>
                <p className="mt-1 text-meta text-text-secondary">
                  {item.severity} · {item.status} · {item.targetType}
                </p>
                {item.snippet ? (
                  <p className="mt-2 border-l-2 border-border pl-3 text-meta text-text-secondary">{item.snippet}</p>
                ) : null}
                {item.status === "open" && (
                  <Button variant="outline" width="full" onClick={() => { setResolvingId(item.id); setResolution("resolved"); setNote(""); setActionError(null); }} className="mt-3">
                    {t("admin.reportsResolve")}
                  </Button>
                )}
              </Card>
            ))}
          </ul>

          <Card className="mt-section-gap">
            <h2 className="font-display text-h3 font-semibold text-text-primary">{t("admin.reportsRestrict")}</h2>
            <p className="mt-1 text-meta text-text-tertiary">{t("admin.reportsRestrictNote")}</p>
            <div className="mt-4 flex flex-col gap-4">
              <Input
                id="admin-restrict-user"
                label={t("admin.rolesUuid")}
                value={restrictId}
                onChange={(e) => setRestrictId(e.target.value.trim())}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
              <Input
                id="admin-restrict-days"
                label={t("admin.reportsDuration")}
                hint={t("admin.reportsDurationHint")}
                type="number"
                min={1}
                value={restrictDays}
                onChange={(e) => setRestrictDays(e.target.value)}
              />
              <Input
                id="admin-restrict-reason"
                label={t("admin.reportsReason")}
                value={restrictReason}
                onChange={(e) => setRestrictReason(e.target.value)}
              />
              <Button
                variant="outline"
                width="full"
                onClick={() => setConfirmRestrict(true)}
                disabled={working || !restrictId || !restrictReason.trim()}
              >
                {t("admin.reportsRestrictGo")}
              </Button>
            </div>
            {actionError && <ErrorState message={actionError} className="mt-4" />}
          </Card>

          <ConfirmDialog
            open={resolvingId !== null}
            title={t("admin.reportsResolve")}
            description={t("admin.reportsResolveConfirm")}
            confirmLabel={t("admin.reportsResolveGo")}
            cancelLabel={t("common.cancel")}
            isConfirming={working}
            confirmError={actionError}
            onConfirm={handleResolve}
            onCancel={() => { setResolvingId(null); setActionError(null); }}
          >
            <Select id="admin-resolve-resolution" label={t("admin.reportsResolution")} value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="resolved">{t("admin.reportsResolved")}</option>
              <option value="dismissed">{t("admin.reportsDismissed")}</option>
            </Select>
            <Input
              id="admin-resolve-note"
              label={t("admin.reportsNote")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              fieldClassName="mt-4"
            />
          </ConfirmDialog>

          <ConfirmDialog
            open={confirmRestrict}
            title={t("admin.reportsRestrict")}
            description={t("admin.reportsRestrictConfirm", { days: restrictDays || "∞" })}
            confirmLabel={t("admin.reportsRestrictGo")}
            cancelLabel={t("common.cancel")}
            tone="danger"
            isConfirming={working}
            confirmError={actionError}
            onConfirm={handleRestrict}
            onCancel={() => { setConfirmRestrict(false); setActionError(null); }}
          />
        </>
      )}
    </PageShell>
  );
}
