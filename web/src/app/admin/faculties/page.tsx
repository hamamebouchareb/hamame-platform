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
  trailerUrl?: string | null;
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

  // Inline trailer editor (course-trailer gap): textarea per row, saved via
  // PUT /admin/faculties/:id/trailer; body {trailerUrl: null} clears.
  const [trailerDrafts, setTrailerDrafts] = useState<Record<string, string>>({});
  const [trailerBusyId, setTrailerBusyId] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);

  async function saveTrailer(row: FacultyRow, value: string) {
    setTrailerError(null);
    setTrailerBusyId(row.id);
    try {
      const trimmed = value.trim();
      await apiFetch(`/admin/faculties/${row.id}/trailer`, {
        method: "PUT",
        body: JSON.stringify({ trailerUrl: trimmed.length > 0 ? trimmed : null }),
      });
      refetch();
      setTrailerDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (err) {
      setTrailerError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setTrailerBusyId(null);
    }
  }

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

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <label htmlFor={`admin-trailer-${row.id}`} className="text-meta font-medium text-text-primary">
                      {t("admin.trailerLabel")}
                    </label>
                    <input
                      id={`admin-trailer-${row.id}`}
                      type="text"
                      value={trailerDrafts[row.id] ?? row.trailerUrl ?? ""}
                      onChange={(e) => setTrailerDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      placeholder="https://…"
                      className="mt-1 w-full rounded-control border border-border bg-surface-1 px-3 py-2 text-meta text-text-primary placeholder:text-text-tertiary"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveTrailer(row, trailerDrafts[row.id] ?? row.trailerUrl ?? "")}
                      disabled={trailerBusyId === row.id || (trailerDrafts[row.id] ?? row.trailerUrl ?? "") === (row.trailerUrl ?? "")}
                      className="inline-flex min-h-touch-target items-center justify-center rounded-control bg-accent-primary px-4 text-body font-semibold text-background disabled:opacity-50"
                    >
                      {trailerBusyId === row.id ? t("common.loading") : t("admin.trailerSave")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTrailer(row, "")}
                      disabled={trailerBusyId === row.id || !row.trailerUrl}
                      className="inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary disabled:opacity-50"
                    >
                      {t("admin.trailerClear")}
                    </button>
                  </div>
                  {row.trailerUrl ? (
                    <p className="text-caption text-text-tertiary break-all">{row.trailerUrl}</p>
                  ) : null}
                </div>
                {trailerError && <ErrorState message={trailerError} className="mt-2" />}
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
