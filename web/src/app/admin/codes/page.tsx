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
import type { Faculty, Year } from "@/lib/types";

interface ActivationCodeRow {
  id: string;
  code: string;
  status: string;
  faculty: string;
  year: string;
  issuedBy: string | null;
  issuedAt: string;
  expiresAt: string | null;
  redeemedBy: string | null;
  redeemedAt: string | null;
}

interface CodesResponse {
  activationCodes: ActivationCodeRow[];
  pagination: { page: number; limit: number; total: number };
}

const STATUSES = ["active", "redeemed", "expired", "revoked"] as const;

function canSeeCodes(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.includes("support_agent") || roles.includes("admin") || roles.includes("super_admin");
}

export default function AdminCodesPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;
  const allowed = canSeeCodes(user?.roles);

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [facultyFilter, setFacultyFilter] = useState<string>("");

  const listPath = canFetch
    ? `/api/admin/activation-codes?${new URLSearchParams({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(facultyFilter ? { facultyId: facultyFilter } : {}),
        limit: "20",
      }).toString()}`
    : null;
  const { data, error, isLoading, refetch } = useApiResource<CodesResponse>(allowed ? listPath : null);
  const { data: facultiesData } = useApiResource<{ faculties: Faculty[] }>(canFetch ? "/faculties" : null);

  const [facultyId, setFacultyId] = useState("");
  const [yearId, setYearId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [confirmingIssue, setConfirmingIssue] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const yearsPath = facultyId ? `/api/faculties/${facultyId}/years` : null;
  const { data: yearsData } = useApiResource<{ years: Year[] }>(canFetch && facultyId ? yearsPath : null);
  const faculties = useMemo(() => facultiesData?.faculties ?? [], [facultiesData]);
  const years = useMemo(() => yearsData?.years ?? [], [yearsData]);
  const rows = useMemo(() => data?.activationCodes ?? [], [data]);

  async function handleIssue() {
    setIssueError(null);
    setIssuedCode(null);
    setIssuing(true);
    try {
      const res = await apiFetch<{ activationCode: { code: string } }>("/api/admin/activation-codes", {
        method: "POST",
        body: JSON.stringify({
          facultyId,
          yearId,
          ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
        }),
      });
      // Shown once for operational copy — never persisted client-side beyond display.
      setIssuedCode(res.activationCode.code);
      setConfirmingIssue(false);
      refetch();
    } catch (err) {
      setIssueError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setIssuing(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokeError(null);
    try {
      await apiFetch(`/api/admin/activation-codes/${id}/revoke`, { method: "POST" });
      setRevokingId(null);
      refetch();
    } catch (err) {
      setRevokeError(err instanceof ApiError ? err.message : t("auth.genericError"));
    }
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("admin.codes")}
      loadingLabel={t("common.loading")}
    >
      {!allowed ? (
        <EmptyState title={t("admin.denied")} description={t("admin.deniedDesc")} action={{ label: t("classement.backToDashboard"), href: "/dashboard" }} />
      ) : (
        <>
          <Card className="mt-section-gap">
            <h2 className="font-display text-h3 font-semibold text-text-primary">{t("admin.codesIssue")}</h2>
            <p className="mt-1 text-meta text-text-tertiary">{t("admin.codesScopeNote")}</p>
            <div className="mt-4 flex flex-col gap-4">
              <Select id="admin-code-faculty" label={t("admin.codesFaculty")} value={facultyId} onChange={(e) => { setFacultyId(e.target.value); setYearId(""); }}>
                <option value="">{t("admin.codesChoose")}</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
              <Select id="admin-code-year" label={t("admin.codesYear")} value={yearId} onChange={(e) => setYearId(e.target.value)} disabled={!facultyId}>
                <option value="">{t("admin.codesChoose")}</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>{y.label}</option>
                ))}
              </Select>
              <Input id="admin-code-expiry" label={t("admin.codesExpiry")} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              {issueError && <ErrorState message={issueError} />}
              <Button width="full" onClick={() => setConfirmingIssue(true)} disabled={!facultyId || !yearId || issuing}>
                {t("admin.codesIssueConfirm")}
              </Button>
            </div>
          </Card>

          {issuedCode && (
            <Card className="mt-4 border-success">
              <p className="text-meta text-success">{t("admin.codesIssuedOnce")}</p>
              <p className="mt-2 break-all font-mono text-body text-text-primary">{issuedCode}</p>
            </Card>
          )}

          <h2 className="mt-section-gap font-display text-h3 font-semibold text-text-primary">{t("admin.codesList")}</h2>
          <div className="mt-4 flex flex-col gap-4">
            <Select id="admin-code-status" label={t("admin.codesStatus")} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t("admin.codesAll")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
            <Select id="admin-code-status-faculty" label={t("admin.codesFaculty")} value={facultyFilter} onChange={(e) => setFacultyFilter(e.target.value)}>
              <option value="">{t("admin.codesAll")}</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </div>

          {isLoading && <LoadingSkeleton className="mt-4 h-5 w-48" ariaLabel={t("common.loading")} />}
          {error && <ErrorState message={error} onRetry={refetch} className="mt-4" />}

          {!isLoading && !error && rows.length === 0 && (
            <p className="mt-4 text-meta text-text-secondary">{t("admin.codesEmpty")}</p>
          )}

          <ul className="mt-4 flex flex-col gap-card-gap">
            {rows.map((row) => (
              <Card as="li" key={row.id}>
                <p className="break-all font-mono text-body text-text-primary">{row.code}</p>
                <p className="mt-1 text-meta text-text-secondary">
                  {row.faculty} — {row.year} · {row.status}
                </p>
                {row.status === "active" && (
                  <Button variant="outline" width="full" onClick={() => setRevokingId(row.id)} className="mt-3">
                    {t("admin.codesRevoke")}
                  </Button>
                )}
              </Card>
            ))}
          </ul>

          <ConfirmDialog
            open={confirmingIssue}
            title={t("admin.codesIssue")}
            description={t("admin.codesIssueSummary")}
            confirmLabel={t("admin.codesIssueConfirm")}
            cancelLabel={t("common.cancel")}
            isConfirming={issuing}
            confirmError={issueError}
            onConfirm={handleIssue}
            onCancel={() => setConfirmingIssue(false)}
          />

          <ConfirmDialog
            open={revokingId !== null}
            title={t("admin.codesRevoke")}
            description={t("admin.codesRevokeConfirm")}
            confirmLabel={t("admin.codesRevoke")}
            cancelLabel={t("common.cancel")}
            tone="danger"
            confirmError={revokeError}
            onConfirm={() => revokingId && handleRevoke(revokingId)}
            onCancel={() => { setRevokingId(null); setRevokeError(null); }}
          />
        </>
      )}
    </PageShell>
  );
}
