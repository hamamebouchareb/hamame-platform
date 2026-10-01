"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { cx } from "@/lib/cx";
import { Button, Card, ErrorState, Input, LoadingSkeleton, PageShell } from "@/components";
import type { Faculty, Year } from "@/lib/types";

type Track = "medecine" | "dentaire" | "pharmacie";

const TRACKS: { id: Track; labelKey: "onboard.trackMed" | "onboard.trackDent" | "onboard.trackPharma" }[] = [
  { id: "medecine", labelKey: "onboard.trackMed" },
  { id: "dentaire", labelKey: "onboard.trackDent" },
  { id: "pharmacie", labelKey: "onboard.trackPharma" },
];

const SKIP_KEY = "hamame_onboarding_skip";

// DiceBear initials presets (external avatar renderer — no upload backend;
// seed carries the display name). Version-pinned URL shape.
const AVATAR_BGS = ["2563eb", "7c3aed", "5b54e8", "0d9488", "db2777", "ea580c"];

function avatarUrl(seed: string, bg: string): string {
  return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${bg}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function BienvenuePage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;

  const [step, setStep] = useState(0);
  const [track, setTrack] = useState<Track | null>(null);
  const [facultyId, setFacultyId] = useState("");
  const [yearId, setYearId] = useState("");
  const [fullName, setFullName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const faculties = useApiResource<{ faculties: Faculty[] }>(canFetch ? "/faculties" : null);
  const years = useApiResource<{ years: Year[] }>(
    canFetch && facultyId ? `/faculties/${facultyId}/years` : null
  );

  const facultyList = useMemo(() => faculties.data?.faculties ?? [], [faculties.data]);
  // Years carry Year.track (backend, additive); pre-track rows (null) stay
  // visible so older faculties never present an empty year step.
  const yearList = useMemo(() => {
    const all = years.data?.years ?? [];
    if (!track) return all;
    const scoped = all.filter((y) => y.track === track);
    return scoped.length > 0 ? scoped : all;
  }, [years.data, track]);

  // Prefill from the signed-in profile once (names are editable below).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (user && !nameTouched) {
      if (user.fullName) setFullName(user.fullName);
      if (!facultyId && user.facultyId) setFacultyId(user.facultyId);
    }
  }, [user, nameTouched, facultyId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Already complete (e.g. direct visit) — nothing to do here.
  useEffect(() => {
    if (isHydrated && user && user.facultyId && user.yearId) {
      router.replace("/dashboard");
    }
  }, [isHydrated, user, router]);

  function skip() {
    try {
      window.localStorage.setItem(SKIP_KEY, "1");
    } catch {
      // Private mode — the gate simply asks again next visit.
    }
    router.push("/dashboard");
  }

  async function finish() {
    if (!facultyId || !yearId || !fullName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = { facultyId, yearId };
      if (fullName.trim() !== user?.fullName) body.fullName = fullName.trim();
      if (photoUrl.trim()) body.profilePhotoUrl = photoUrl.trim();
      await apiFetch("/users/me", { method: "PUT", body: JSON.stringify(body) });
      await refreshProfile();
      router.push("/dashboard");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("onboard.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const canNext =
    step === 0 ? track !== null : step === 1 ? facultyId !== "" : step === 2 ? yearId !== "" : fullName.trim() !== "";

  const seed = fullName.trim() || "Hamame";

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("onboard.welcome")}
      description={t("onboard.intro")}
      loadingLabel={t("common.loading")}
    >
      <>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-meta font-medium text-text-secondary">{t("onboard.stepOf", { i: step + 1 })}</p>
          <button
            type="button"
            onClick={skip}
            className="text-meta font-medium text-accent-soft underline underline-offset-2 hover:text-accent-soft/80"
          >
            {t("onboard.skip")}
          </button>
        </div>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cx("h-1.5 flex-1 rounded-pill", i <= step ? "bg-accent-primary" : "bg-surface-3")}
            />
          ))}
        </div>

        {step === 0 ? (
          <section aria-label={t("onboard.trackTitle")} className="mt-section-gap">
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("onboard.trackTitle")}</h2>
            <p className="mt-1 text-body text-text-secondary">{t("onboard.trackSub")}</p>
            <div className="mt-4 grid gap-card-gap sm:grid-cols-3">
              {TRACKS.map((option) => {
                const active = track === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTrack(option.id)}
                    aria-pressed={active}
                    className={cx(
                      "flex min-h-touch-target items-center justify-center rounded-card border px-4 py-5 text-center font-display text-h3 font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                      active
                        ? "border-accent-primary bg-accent-primary/15 text-text-primary shadow-glow-primary"
                        : "border-border bg-surface-1 text-text-primary hover:border-border-strong hover:bg-surface-2"
                    )}
                  >
                    {t(option.labelKey)}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section aria-label={t("onboard.facultyTitle")} className="mt-section-gap">
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("onboard.facultyTitle")}</h2>
            <p className="mt-1 text-body text-text-secondary">{t("onboard.facultySub")}</p>
            {faculties.isLoading && facultyList.length === 0 ? (
              <div className="mt-4 flex flex-col gap-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <LoadingSkeleton key={i} className="h-14 w-full rounded-card" />
                ))}
              </div>
            ) : faculties.error ? (
              <ErrorState className="mt-4" message={faculties.error} onRetry={faculties.refetch} />
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {facultyList.map((faculty) => {
                  const active = facultyId === faculty.id;
                  return (
                    <li key={faculty.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setFacultyId(faculty.id);
                          setYearId("");
                        }}
                        aria-pressed={active}
                        className={cx(
                          "flex min-h-touch-target w-full items-center justify-between gap-3 rounded-control border px-4 text-left text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                          active
                            ? "border-accent-primary bg-accent-primary/15 text-text-primary"
                            : "border-border bg-surface-1 text-text-primary hover:bg-surface-2"
                        )}
                      >
                        {faculty.name}
                        {active ? <span aria-hidden className="text-accent-soft">✓</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-label={t("onboard.yearTitle")} className="mt-section-gap">
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("onboard.yearTitle")}</h2>
            <p className="mt-1 text-body text-text-secondary">{t("onboard.yearSub")}</p>
            {years.isLoading && yearList.length === 0 ? (
              <div className="mt-4 flex flex-col gap-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <LoadingSkeleton key={i} className="h-14 w-full rounded-card" />
                ))}
              </div>
            ) : years.error ? (
              <ErrorState className="mt-4" message={years.error} onRetry={years.refetch} />
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {yearList.map((year) => {
                  const active = yearId === year.id;
                  const noExams = year.label === "Internat";
                  return (
                    <li key={year.id}>
                      <button
                        type="button"
                        onClick={() => setYearId(year.id)}
                        aria-pressed={active}
                        className={cx(
                          "flex min-h-touch-target w-full flex-col justify-center gap-0.5 rounded-control border px-4 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                          active
                            ? "border-accent-primary bg-accent-primary/15"
                            : "border-border bg-surface-1 hover:bg-surface-2"
                        )}
                      >
                        <span className="text-body font-medium text-text-primary">{year.label}</span>
                        {noExams ? (
                          <span className="text-caption text-text-tertiary">{t("onboard.noExamsNote")}</span>
                        ) : null}
                      </button>
                      {active ? <span className="sr-only">✓</span> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-label={t("onboard.profileTitle")} className="mt-section-gap">
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("onboard.profileTitle")}</h2>
            <p className="mt-1 text-body text-text-secondary">{t("onboard.profileSub")}</p>
            <Card className="mt-4">
              <div className="flex items-center gap-4">
                {photoUrl.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl.trim()}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-pill bg-surface-3 object-cover"
                    onError={() => setPhotoUrl("")}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-pill bg-accent-primary font-display text-h2 font-bold text-on-accent"
                  >
                    {initialsOf(seed)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-display text-h3 font-semibold text-text-primary">
                    {fullName.trim() || seed}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label={t("onboard.profileTitle")}>
                {AVATAR_BGS.map((bg) => {
                  const url = avatarUrl(seed, bg);
                  const active = photoUrl.trim() === url;
                  return (
                    <button
                      key={bg}
                      type="button"
                      onClick={() => setPhotoUrl(url)}
                      aria-pressed={active}
                      aria-label={url}
                      className={cx(
                        "flex min-h-touch-target items-center justify-center rounded-control border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                        active ? "border-accent-primary" : "border-border hover:bg-surface-2"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-10 w-10 rounded-pill" loading="lazy" />
                    </button>
                  );
                })}
              </div>
              <Input
                id="onboard-name"
                label={t("settings.fullName")}
                type="text"
                required
                autoComplete="name"
                value={fullName}
                fieldClassName="mt-4"
                onChange={(e) => {
                  setFullName(e.target.value);
                  setNameTouched(true);
                }}
              />
              <Input
                id="onboard-photo"
                label={t("onboard.photoLabel")}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={photoUrl}
                fieldClassName="mt-3"
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
            </Card>
            {saveError ? <ErrorState message={saveError} className="mt-3" /> : null}
          </section>
        ) : null}

        <div className="mt-section-gap flex gap-2">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={saving}>
              {t("onboard.back")}
            </Button>
          ) : null}
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext || saving} className="flex-1">
              {t("onboard.next")}
            </Button>
          ) : (
            <Button onClick={finish} disabled={!canNext || saving} className="flex-1">
              {saving ? t("onboard.saving") : t("onboard.finish")}
            </Button>
          )}
        </div>
      </>
    </PageShell>
  );
}
