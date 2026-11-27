"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { localeFor, type UiLanguage } from "@/lib/i18n";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageShell,
  useToast,
} from "@/components";
import { Input, Select, Textarea } from "@/components/Field";
import type { Faculty, Year } from "@/lib/types";

type SimulationStatus = "scheduled" | "live" | "completed" | "cancelled";

interface SimulationRow {
  id: string;
  title: string;
  description: string | null;
  faculty: { id: string; name: string };
  year: { id: string; label: string } | null;
  scheduledAt: string;
  endsAt: string;
  durationMinutes: number;
  questionCount: number;
  status: SimulationStatus;
  registeredCount: number;
}

function canManageSimulations(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.includes("admin") || roles.includes("super_admin");
}

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWhen(iso: string, lang: UiLanguage): string {
  return new Date(iso).toLocaleString(localeFor(lang), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: SimulationStatus }) {
  const { t } = useLanguage();
  const styles: Record<SimulationStatus, string> = {
    live: "border-danger/50 bg-danger/10 text-danger",
    scheduled: "border-accent-qcm/40 bg-accent-qcm/10 text-accent-soft",
    completed: "border-border bg-surface-2 text-text-secondary",
    cancelled: "border-border bg-surface-2 text-text-tertiary line-through",
  };
  const labelKey =
    status === "live"
      ? "admin.simStatusLive"
      : status === "scheduled"
        ? "admin.simStatusScheduled"
        : status === "completed"
          ? "admin.simStatusCompleted"
          : "admin.simStatusCancelled";

  return (
    <span className={cx("rounded-pill border px-2.5 py-0.5 text-caption font-semibold", styles[status])}>
      {t(labelKey)}
    </span>
  );
}

export default function AdminSimulationsPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { lang, t } = useLanguage();
  const toast = useToast();
  const canFetch = isHydrated && !!user;
  const allowed = canManageSimulations(user?.roles);

  const { data, error, isLoading, refetch } = useApiResource<{ simulations: SimulationRow[] }>(
    canFetch && allowed ? "/simulations" : null
  );
  const { data: facultiesData } = useApiResource<{ faculties: Faculty[] }>(
    canFetch && allowed ? "/faculties" : null
  );

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [yearId, setYearId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("120");
  const [questionCount, setQuestionCount] = useState("50");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Row edit / action state
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: yearsData } = useApiResource<{ years: Year[] }>(
    canFetch && allowed && facultyId ? `/faculties/${facultyId}/years` : null
  );

  const faculties = useMemo(() => facultiesData?.faculties ?? [], [facultiesData]);
  const years = useMemo(() => yearsData?.years ?? [], [yearsData]);
  const simulations = useMemo(() => data?.simulations ?? [], [data]);

  const parsedDuration = Number.parseInt(durationMinutes, 10);
  const parsedQuestions = Number.parseInt(questionCount, 10);
  const canCreate =
    title.trim().length > 0 &&
    title.trim().length <= 120 &&
    facultyId.length > 0 &&
    scheduledAt.length > 0 &&
    Number.isInteger(parsedDuration) &&
    parsedDuration >= 1 &&
    parsedDuration <= 600 &&
    Number.isInteger(parsedQuestions) &&
    parsedQuestions >= 1 &&
    parsedQuestions <= 200;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!canCreate || creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      await apiFetch("/admin/simulations", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() ? description.trim() : null,
          facultyId,
          yearId: yearId || null,
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: parsedDuration,
          questionCount: parsedQuestions,
        }),
      });
      setTitle("");
      setDescription("");
      setScheduledAt("");
      toast.success({ title: t("admin.simCreated") });
      refetch();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t("auth.genericError");
      setCreateError(message);
      toast.error({ title: message });
    } finally {
      setCreating(false);
    }
  }

  async function handlePatch(
    id: string,
    payload: { scheduledAt?: string; cancelledAt?: string | null }
  ) {
    setBusyId(id);
    try {
      await apiFetch(`/admin/simulations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setRescheduleId(null);
      toast.success({ title: t("admin.simUpdated") });
      refetch();
    } catch (err) {
      toast.error({ title: err instanceof ApiError ? err.message : t("auth.genericError") });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    setBusyId(id);
    try {
      await apiFetch(`/admin/simulations/${id}`, { method: "DELETE" });
      setDeletingId(null);
      toast.success({ title: t("admin.simDeleted") });
      refetch();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      title={t("admin.simulations")}
      loadingLabel={t("common.loading")}
    >
      {!allowed ? (
        <EmptyState
          title={t("admin.denied")}
          description={t("admin.deniedDesc")}
          action={{ label: t("classement.backToDashboard"), href: "/dashboard" }}
        />
      ) : (
        <>
          <Card className="mt-section-gap">
            <h2 className="font-display text-h3 font-semibold text-text-primary">
              {t("admin.simCreateTitle")}
            </h2>
            <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-4">
              <Input
                id="admin-sim-title"
                label={t("admin.simTitle")}
                placeholder={t("admin.simTitlePh")}
                value={title}
                maxLength={120}
                required
                onChange={(e) => setTitle(e.target.value)}
              />

              <Textarea
                id="admin-sim-desc"
                label={t("admin.simDesc")}
                placeholder={t("admin.simDescPh")}
                value={description}
                maxLength={1000}
                rows={3}
                onChange={(e) => setDescription(e.target.value)}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  id="admin-sim-faculty"
                  label={t("admin.simFaculty")}
                  value={facultyId}
                  required
                  onChange={(e) => {
                    setFacultyId(e.target.value);
                    setYearId("");
                  }}
                >
                  <option value="">{t("admin.codesChoose")}</option>
                  {faculties.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </Select>

                <Select
                  id="admin-sim-year"
                  label={t("admin.simYear")}
                  value={yearId}
                  disabled={!facultyId}
                  onChange={(e) => setYearId(e.target.value)}
                >
                  <option value="">{t("admin.simAllYears")}</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Input
                  id="admin-sim-scheduled"
                  label={t("admin.simScheduledAt")}
                  type="datetime-local"
                  value={scheduledAt}
                  required
                  fieldClassName="flex-1"
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setScheduledAt(toDatetimeLocal(new Date()))}
                >
                  {t("admin.simStartNow")}
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="admin-sim-duration"
                  label={t("admin.simDuration")}
                  type="number"
                  min={1}
                  max={600}
                  required
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />
                <Input
                  id="admin-sim-questions"
                  label={t("admin.simQuestionCount")}
                  type="number"
                  min={1}
                  max={200}
                  required
                  value={questionCount}
                  onChange={(e) => setQuestionCount(e.target.value)}
                />
              </div>

              {createError ? <ErrorState message={createError} /> : null}

              <Button type="submit" width="full" disabled={!canCreate || creating}>
                {creating ? t("admin.simCreating") : t("admin.simCreateBtn")}
              </Button>
            </form>
          </Card>

          <h2 className="mt-section-gap font-display text-h3 font-semibold text-text-primary">
            {t("admin.simListTitle")}
          </h2>

          {isLoading ? (
            <LoadingSkeleton className="mt-4 h-24 w-full" ariaLabel={t("common.loading")} />
          ) : null}
          {error ? <ErrorState message={error} onRetry={refetch} className="mt-4" /> : null}

          {!isLoading && !error && simulations.length === 0 ? (
            <p className="mt-4 text-meta text-text-secondary">{t("admin.simEmpty")}</p>
          ) : null}

          <ul className="mt-4 flex flex-col gap-card-gap">
            {simulations.map((sim) => {
              const busy = busyId === sim.id;
              const isEditing = rescheduleId === sim.id;
              return (
                <Card as="li" key={sim.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-h3 font-semibold text-text-primary">
                      {sim.title}
                    </h3>
                    <StatusBadge status={sim.status} />
                  </div>

                  {sim.description ? (
                    <p className="mt-2 text-body text-text-secondary">{sim.description}</p>
                  ) : null}

                  <p className="mt-2 text-meta text-text-secondary">
                    {sim.faculty.name}
                    {sim.year ? ` — ${sim.year.label}` : ""} · {formatWhen(sim.scheduledAt, lang)}
                  </p>
                  <p className="mt-1 text-caption text-text-tertiary">
                    {t("admin.simMeta", {
                      duration: String(sim.durationMinutes),
                      count: String(sim.questionCount),
                      registered: String(sim.registeredCount),
                    })}
                  </p>

                  {isEditing ? (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <Input
                        id={`reschedule-${sim.id}`}
                        label={t("admin.simScheduledAt")}
                        type="datetime-local"
                        value={rescheduleValue}
                        fieldClassName="flex-1"
                        onChange={(e) => setRescheduleValue(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          disabled={busy || !rescheduleValue}
                          onClick={() =>
                            handlePatch(sim.id, {
                              scheduledAt: new Date(rescheduleValue).toISOString(),
                            })
                          }
                        >
                          {t("admin.simSaveDate")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setRescheduleId(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setRescheduleId(sim.id);
                          setRescheduleValue(toDatetimeLocal(new Date(sim.scheduledAt)));
                        }}
                      >
                        {t("admin.simReschedule")}
                      </Button>
                      {sim.status === "cancelled" ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => handlePatch(sim.id, { cancelledAt: null })}
                        >
                          {t("admin.simRestoreSim")}
                        </Button>
                      ) : sim.status !== "completed" ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            handlePatch(sim.id, { cancelledAt: new Date().toISOString() })
                          }
                        >
                          {t("admin.simCancelSim")}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setDeleteError(null);
                          setDeletingId(sim.id);
                        }}
                      >
                        {t("admin.simDelete")}
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </ul>

          <ConfirmDialog
            open={deletingId !== null}
            title={t("admin.simDeleteTitle")}
            description={t("admin.simDeleteConfirm")}
            confirmLabel={t("admin.simDelete")}
            cancelLabel={t("common.cancel")}
            tone="danger"
            isConfirming={deletingId !== null && busyId === deletingId}
            confirmError={deleteError}
            onConfirm={() => deletingId && handleDelete(deletingId)}
            onCancel={() => {
              setDeletingId(null);
              setDeleteError(null);
            }}
          />
        </>
      )}
    </PageShell>
  );
}
