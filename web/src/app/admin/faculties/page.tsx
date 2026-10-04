"use client";

import { useMemo, useState } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageShell,
} from "@/components";
import { Select } from "@/components/Field";

interface FacultyRow {
  id: string;
  name: string;
  slug: string;
  rolloutStatus: string;
}

const ROLLOUT = ["planned", "beta", "live"] as const;

function canManageFaculties(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.includes("admin") || roles.includes("super_admin");
}

export default function AdminFacultiesPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;
  const allowed = canManageFaculties(user?.roles);

  // Admin list endpoint (all rollout statuses — the public one hides `planned`
  // rows, which would make a flipped row vanish and planned rows unflippable).
  const { data, error, isLoading, refetch } = useApiResource<{ faculties: FacultyRow[] }>(
    allowed && canFetch ? "/admin/faculties" : null
  );
  const rows = useMemo(() => data?.faculties ?? [], [data]);

  const [pending, setPending] = useState<{ id: string; name: string; status: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!pending) return;
    setSaveError(null);
    setSaving(true);
    try {
      await apiFetch(`/admin/faculties/${pending.id}/rollout-status`, {
        method: "PUT",
        body: JSON.stringify({ rolloutStatus: pending.status }),
      });
      setPending(null);
      refetch();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("admin.faculties")}
      loadingLabel={t("common.loading")}
    >
      {!allowed ? (
        <EmptyState title={t("admin.denied")} description={t("admin.deniedDesc")} action={{ label: t("classement.backToDashboard"), href: "/dashboard" }} />
      ) : (
        <>
          <p className="mt-section-gap text-meta text-text-tertiary">{t("admin.rolloutNote")}</p>

          {isLoading && <LoadingSkeleton className="mt-4 h-5 w-48" ariaLabel={t("common.loading")} />}
          {error && <ErrorState message={error} onRetry={refetch} className="mt-4" />}

          {!isLoading && !error && rows.length === 0 && (
            <p className="mt-4 text-meta text-text-secondary">{t("admin.facEmpty")}</p>
          )}

          <ul className="mt-4 flex flex-col gap-card-gap">
            {rows.map((row) => (
              <Card as="li" key={row.id}>
                <p className="text-body font-medium text-text-primary">{row.name}</p>
                <p className="mt-1 text-meta text-text-secondary">
                  {t("admin.rolloutStatus")}: {row.rolloutStatus}
                </p>
                <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end">
                  <Select
                    id={`admin-rollout-${row.id}`}
                    label={t("admin.rolloutStatus")}
                    value={row.rolloutStatus}
                    onChange={(e) => {
                      if (e.target.value !== row.rolloutStatus) {
                        setPending({ id: row.id, name: row.name, status: e.target.value });
                      }
                    }}
                  >
                    {ROLLOUT.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </div>
              </Card>
            ))}
          </ul>

          <ConfirmDialog
            open={pending !== null}
            title={t("admin.faculties")}
            description={pending ? t("admin.rolloutConfirm", { name: pending.name, status: pending.status }) : undefined}
            confirmLabel={t("common.confirm")}
            cancelLabel={t("common.cancel")}
            tone="danger"
            isConfirming={saving}
            confirmError={saveError}
            onConfirm={handleConfirm}
            onCancel={() => { setPending(null); setSaveError(null); }}
          />

        </>
      )}
    </PageShell>
  );
}
