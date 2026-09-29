"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import type { I18nKey } from "@/lib/i18n";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { useApiResource } from "@/lib/useApiResource";
import { usePushSubscription } from "@/lib/usePushSubscription";
import { useToast } from "@/components/Toast";
import { AppHeader, Footer, LanguageToggle, LoadingSkeleton } from "@/components";
import type { PushPreferences } from "@/lib/types";

const WILAYAS = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar",
  "Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger",
  "Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma",
  "Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh",
  "Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued",
  "Khenchela","Souk Ahras","Tipaza","Mila","Aïn Defla","Naâma","Aïn Témouchent",
  "Ghardaïa","Relizane","El M'Ghair","El Meniaa","Ouled Djellal","Bordj Badji Mokhtar",
  "Béni Abbès","Timimoun","Touggourt","Djanet","In Salah","In Guezzam",
];

const inputClass =
  "w-full rounded-control border border-border bg-surface-2 px-3 py-2.5 text-body text-text-primary placeholder:text-text-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50";

const labelClass = "block text-meta font-medium text-text-secondary mb-1";

const errorTextClass = "mt-1 text-caption text-danger";

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label} — ${checked ? t("builder.switchOn") : t("builder.switchOff")}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? "bg-accent-primary" : "bg-surface-3"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-background transition ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const PREFERENCE_ROWS: { key: keyof PushPreferences; labelKey: I18nKey; descriptionKey: I18nKey }[] = [
  {
    key: "dailyGoalReminder",
    labelKey: "settings.prefDaily",
    descriptionKey: "settings.prefDailyDesc",
  },
  {
    key: "streakAtRisk",
    labelKey: "settings.prefStreak",
    descriptionKey: "settings.prefStreakDesc",
  },
  {
    key: "badgeEarned",
    labelKey: "settings.prefBadge",
    descriptionKey: "settings.prefBadgeDesc",
  },
];

interface FieldErrors {
  fullName?: string;
  facultyId?: string;
  yearId?: string;
  wilaya?: string;
}

export default function SettingsPage() {
  const { user, isHydrated } = useRequireAuth();
  const router = useRouter();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const toast = useToast();
  const push = usePushSubscription();
  const canFetch = isHydrated && !!user;

  /* ── Push preferences ── */
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    setPreferencesError(null);
    try {
      const data = await apiFetch<{ preferences: PushPreferences }>("/push/preferences");
      setPreferences(data.preferences);
    } catch (err) {
      setPreferencesError(err instanceof ApiError ? err.message : t("settings.prefsLoadError"));
    } finally {
      setPreferencesLoaded(true);
    }
  }, [t]);

  /* ── Password change ── */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<{
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  async function changePassword() {
    setPasswordError(null);
    const fieldErrors: { newPassword?: string; confirmPassword?: string } = {};
    if (newPassword.length < 8) {
      fieldErrors.newPassword = t("settings.passwordTooShort");
    }
    if (newPassword !== confirmPassword) {
      fieldErrors.confirmPassword = t("settings.passwordMismatch");
    }
    setPasswordFieldErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setChangingPassword(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success({ title: t("settings.passwordUpdated") });
    } catch {
      // Generic on purpose — the API rejects every failure mode with the same
      // PASSWORD_CHANGE_FAILED code so the UI must not reveal whether the current
      // password was wrong.
      setPasswordError(t("settings.passwordChangeError"));
    } finally {
      setChangingPassword(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (canFetch && !preferencesLoaded) {
      loadPreferences();
    }
  }, [canFetch, preferencesLoaded, loadPreferences]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function updatePreference(key: keyof PushPreferences, value: boolean) {
    if (!preferences) return;
    const previous = preferences;
    setSavingKey(key);
    setPreferences({ ...preferences, [key]: value });
    setPreferencesError(null);
    try {
      const data = await apiFetch<{ preferences: PushPreferences }>("/push/preferences", {
        method: "PUT",
        body: JSON.stringify({ [key]: value }),
      });
      setPreferences(data.preferences);
    } catch (err) {
      setPreferences(previous);
      setPreferencesError(err instanceof ApiError ? err.message : t("settings.saveError"));
    } finally {
      setSavingKey(null);
    }
  }

  /* ── Personal info form ── */
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [wilaya, setWilaya] = useState(user?.wilaya ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState<FieldErrors>({});

  const faculties = useApiResource<{ faculties: { id: string; name: string }[] }>(
    canFetch ? "/faculties" : null
  );
  const [facultyId, setFacultyId] = useState(user?.facultyId ?? "");

  const years = useApiResource<{ years: { id: string; label: string }[] }>(
    canFetch && facultyId ? `/faculties/${facultyId}/years` : null
  );
  const [yearId, setYearId] = useState(user?.yearId ?? "");

  async function saveProfile() {
    setProfileErrors({});
    const errors: FieldErrors = {};
    if (!fullName.trim()) errors.fullName = t("settings.nameRequired");
    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      return;
    }

    setSavingProfile(true);
    try {
      const body: Record<string, unknown> = {};
      if (fullName.trim() !== user?.fullName) body.fullName = fullName.trim();
      if (facultyId !== user?.facultyId) body.facultyId = facultyId || null;
      if (yearId !== user?.yearId) body.yearId = yearId || null;
      if (wilaya !== (user?.wilaya ?? "")) body.wilaya = wilaya || null;

      if (Object.keys(body).length === 0) {
        toast.info({ title: t("settings.noChanges") });
        setSavingProfile(false);
        return;
      }

      await apiFetch("/users/me", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      toast.success({ title: t("settings.profileUpdated") });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("settings.saveError");
      toast.error({ title: message });
    } finally {
      setSavingProfile(false);
    }
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <p className="text-meta text-text-secondary">{t("common.loadingMore")}</p>
      </main>
    );
  }

  const masterEnabled = preferences?.masterEnabled ?? true;

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-card-padding py-section-gap">
        <h1 className="font-display text-h2 font-bold text-text-primary sm:text-h1">{t("nav.settings")}</h1>

        <div className="mt-section-gap grid gap-section-gap lg:grid-cols-2">
          {/* ── Personal info card ── */}
          <section aria-label={t("settings.personalInfo")} className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("settings.personalInfo")}</h2>

            <div className="mt-4 flex flex-col gap-4">
              {/* Full name */}
              <div>
                <label htmlFor="fullName" className={labelClass}>{t("settings.fullName")}</label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                  aria-describedby={profileErrors.fullName ? "fullName-error" : undefined}
                  aria-invalid={!!profileErrors.fullName || undefined}
                />
                {profileErrors.fullName ? <p id="fullName-error" className={errorTextClass}>{profileErrors.fullName}</p> : null}
              </div>

              {/* Email (read-only) */}
              <div>
                <label htmlFor="email" className={labelClass}>{t("settings.email")}</label>
                <input
                  id="email"
                  type="email"
                  value={user.email ?? "—"}
                  readOnly
                  className={`${inputClass} opacity-60 cursor-not-allowed`}
                />
                <p className="mt-1 text-caption text-text-tertiary">{t("settings.emailReadonly")}</p>
              </div>

              {/* Phone (read-only) */}
              <div>
                <label htmlFor="phone" className={labelClass}>{t("settings.phone")}</label>
                <input
                  id="phone"
                  type="tel"
                  value={user.phone ?? "—"}
                  readOnly
                  className={`${inputClass} opacity-60 cursor-not-allowed`}
                />
                <p className="mt-1 text-caption text-text-tertiary">{t("settings.phoneReadonly")}</p>
              </div>

              {/* Faculty */}
              <div>
                <label htmlFor="facultyId" className={labelClass}>{t("settings.faculty")}</label>
                <select
                  id="facultyId"
                  value={facultyId}
                  onChange={(e) => { setFacultyId(e.target.value); setYearId(""); }}
                  className={inputClass}
                >
                  <option value="">{t("settings.none")}</option>
                  {faculties.data?.faculties.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div>
                <label htmlFor="yearId" className={labelClass}>{t("settings.year")}</label>
                <select
                  id="yearId"
                  value={yearId}
                  onChange={(e) => setYearId(e.target.value)}
                  disabled={!facultyId}
                  className={inputClass}
                >
                  <option value="">{t("settings.none")}</option>
                  {years.data?.years.map((y) => (
                    <option key={y.id} value={y.id}>{y.label}</option>
                  ))}
                </select>
                {!facultyId ? <p className={errorTextClass}>{t("settings.needFaculty")}</p> : null}
              </div>

              {/* Wilaya */}
              <div>
                <label htmlFor="wilaya" className={labelClass}>{t("settings.wilaya")}</label>
                <select
                  id="wilaya"
                  value={wilaya}
                  onChange={(e) => setWilaya(e.target.value)}
                  className={inputClass}
                >
                  <option value="">{t("settings.none")}</option>
                  {WILAYAS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={saveProfile}
                disabled={savingProfile}
                className="mt-2 inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-primary px-5 text-body font-medium text-on-accent shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none sm:w-auto"
              >
                {savingProfile ? t("settings.saving") : t("settings.save")}
              </button>
            </div>
          </section>

          {/* ── Password change card ── */}
          <section aria-label={t("settings.passwordTitle")} className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("settings.passwordTitle")}</h2>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="current-password" className={labelClass}>{t("settings.currentPassword")}</label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="new-password" className={labelClass}>{t("settings.newPassword")}</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordFieldErrors.newPassword) {
                      setPasswordFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
                    }
                  }}
                  className={inputClass}
                  aria-invalid={!!passwordFieldErrors.newPassword || undefined}
                  aria-describedby={passwordFieldErrors.newPassword ? "new-password-error" : "new-password-hint"}
                />
                {passwordFieldErrors.newPassword ? (
                  <p id="new-password-error" className={errorTextClass}>{passwordFieldErrors.newPassword}</p>
                ) : (
                  <p id="new-password-hint" className="mt-1 text-caption text-text-tertiary">{t("settings.minLength")}</p>
                )}
              </div>
              <div>
                <label htmlFor="confirm-password" className={labelClass}>{t("settings.confirmPassword")}</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (passwordFieldErrors.confirmPassword) {
                      setPasswordFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                    }
                  }}
                  className={inputClass}
                  aria-invalid={!!passwordFieldErrors.confirmPassword || undefined}
                  aria-describedby={passwordFieldErrors.confirmPassword ? "confirm-password-error" : undefined}
                />
                {passwordFieldErrors.confirmPassword ? (
                  <p id="confirm-password-error" className={errorTextClass}>{passwordFieldErrors.confirmPassword}</p>
                ) : null}
              </div>

              {passwordError ? (
                <p role="alert" className="rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
                  {passwordError}
                </p>
              ) : null}

              <button
                type="button"
                onClick={changePassword}
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="mt-2 inline-flex min-h-touch-target w-full items-center justify-center rounded-control bg-accent-primary px-5 text-body font-medium text-on-accent shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none sm:w-auto"
              >
                {changingPassword ? t("settings.updating") : t("settings.changePassword")}
              </button>
            </div>
          </section>

          {/* ── Language card ── */}
          <section aria-label={t("language.label")} className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("language.label")}</h2>
            <p className="mt-1 text-body text-text-secondary">{t("settings.languageDesc")}</p>
            <div className="mt-4">
              <LanguageToggle />
            </div>
          </section>
        </div>

        {/* ── Notification settings (full width) ── */}
        <section aria-label={t("settings.notifications")} className="mt-section-gap rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
          <h2 className="font-display text-h2 font-semibold text-text-primary">{t("settings.notifications")}</h2>

          <div className="mt-4">
            <p className="text-body text-text-secondary">
              {push.isSupported
                ? push.isSubscribed
                  ? t("settings.pushOn")
                  : t("settings.pushOff")
                : t("settings.pushUnsupported")}
            </p>

            {push.isSupported && (
              <button
                type="button"
                onClick={push.isSubscribed ? push.unsubscribe : push.subscribe}
                disabled={push.isLoading}
                className={
                  push.isSubscribed
                    ? "mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50"
                    : "mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control bg-accent-primary px-4 text-body font-medium text-on-accent shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50"
                }
              >
                {push.isLoading ? t("settings.pushLoading") : push.isSubscribed ? t("settings.pushDisable") : t("settings.pushEnable")}
              </button>
            )}

            {push.error ? (
              <p role="alert" className="mt-2 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
                {push.error}
              </p>
            ) : null}
          </div>

          {!preferencesLoaded ? (
            <div className="mt-4">
              <LoadingSkeleton className="h-8 w-48" ariaLabel={t("settings.prefsLoading")} />
            </div>
          ) : preferencesError ? (
            <p role="alert" className="mt-4 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
              {preferencesError}
            </p>
          ) : preferences ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                <div>
                  <p className="text-body font-medium text-text-primary">{t("settings.allNotifications")}</p>
                  <p className="mt-0.5 text-meta text-text-secondary">{t("settings.masterDesc")}</p>
                </div>
                <Switch
                  checked={masterEnabled}
                  disabled={savingKey === "masterEnabled"}
                  onChange={(next) => updatePreference("masterEnabled", next)}
                  label={t("settings.allNotifications")}
                />
              </div>

              <ul className="mt-4 flex flex-col gap-4">
                {PREFERENCE_ROWS.map((row) => (
                  <li key={row.key} className="flex items-center justify-between gap-4 border-t border-border pt-4">
                    <div className={!masterEnabled ? "opacity-50" : undefined}>
                      <p className="text-body font-medium text-text-primary">{t(row.labelKey)}</p>
                      <p className="mt-0.5 text-meta text-text-secondary">{t(row.descriptionKey)}</p>
                    </div>
                    <Switch
                      checked={preferences[row.key]}
                      disabled={!masterEnabled || savingKey === row.key}
                      onChange={(next) => updatePreference(row.key, next)}
                      label={t(row.labelKey)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </main>

      <Footer />
    </>
  );
}
