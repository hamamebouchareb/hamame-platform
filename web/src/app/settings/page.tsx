"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme, type ThemeChoice } from "@/context/ThemeContext";
import type { I18nKey } from "@/lib/i18n";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { apiFetch, ApiError } from "@/lib/api";
import { useApiResource } from "@/lib/useApiResource";
import { usePushSubscription } from "@/lib/usePushSubscription";
import { useToast } from "@/components/Toast";
import { Button, Card, ErrorState, Input, LanguageToggle, LoadingSkeleton, PageShell, PrimaryTabs, Select } from "@/components";
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
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
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

  const masterEnabled = preferences?.masterEnabled ?? true;

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="content"
      title={t("nav.settings")}
      loadingLabel={t("common.loadingMore")}
    >
      {(authed) => (
      <>
        <div className="mt-section-gap grid gap-section-gap lg:grid-cols-2">
          {/* ── Personal info card ── */}
          <Card as="section" aria-label={t("settings.personalInfo")}>
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("settings.personalInfo")}</h2>

            <div className="mt-4 flex flex-col gap-4">
              {/* Full name */}
              <Input
                id="fullName"
                label={t("settings.fullName")}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                error={profileErrors.fullName}
              />

              {/* Email (read-only) */}
              <Input
                id="email"
                label={t("settings.email")}
                type="email"
                value={authed.email ?? "—"}
                readOnly
                hint={t("settings.emailReadonly")}
                className="opacity-60 cursor-not-allowed"
              />

              {/* Phone (read-only) */}
              <Input
                id="phone"
                label={t("settings.phone")}
                type="tel"
                value={authed.phone ?? "—"}
                readOnly
                hint={t("settings.phoneReadonly")}
                className="opacity-60 cursor-not-allowed"
              />

              {/* Faculty */}
              <Select
                id="facultyId"
                label={t("settings.faculty")}
                value={facultyId}
                onChange={(e) => { setFacultyId(e.target.value); setYearId(""); }}
              >
                <option value="">{t("settings.none")}</option>
                {faculties.data?.faculties.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>

              {/* Year */}
              <Select
                id="yearId"
                label={t("settings.year")}
                value={yearId}
                onChange={(e) => setYearId(e.target.value)}
                disabled={!facultyId}
                hint={!facultyId ? t("settings.needFaculty") : undefined}
              >
                <option value="">{t("settings.none")}</option>
                {years.data?.years.map((y) => (
                  <option key={y.id} value={y.id}>{y.label}</option>
                ))}
              </Select>

              {/* Wilaya */}
              <Select
                id="wilaya"
                label={t("settings.wilaya")}
                value={wilaya}
                onChange={(e) => setWilaya(e.target.value)}
              >
                <option value="">{t("settings.none")}</option>
                {WILAYAS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </Select>

              <Button width="full-mobile" onClick={saveProfile} disabled={savingProfile} className="mt-2">
                {savingProfile ? t("settings.saving") : t("settings.save")}
              </Button>
            </div>
          </Card>

          {/* ── Password change card ── */}
          <Card as="section" aria-label={t("settings.passwordTitle")}>
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("settings.passwordTitle")}</h2>

            <div className="mt-4 flex flex-col gap-3">
              <Input
                id="current-password"
                label={t("settings.currentPassword")}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <Input
                id="new-password"
                label={t("settings.newPassword")}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (passwordFieldErrors.newPassword) {
                    setPasswordFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
                  }
                }}
                error={passwordFieldErrors.newPassword}
                hint={passwordFieldErrors.newPassword ? undefined : t("settings.minLength")}
              />
              <Input
                id="confirm-password"
                label={t("settings.confirmPassword")}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (passwordFieldErrors.confirmPassword) {
                    setPasswordFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                  }
                }}
                error={passwordFieldErrors.confirmPassword}
              />

              {passwordError ? <ErrorState message={passwordError} /> : null}

              <Button
                width="full-mobile"
                onClick={changePassword}
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="mt-2"
              >
                {changingPassword ? t("settings.updating") : t("settings.changePassword")}
              </Button>
            </div>
          </Card>

          {/* ── Language card ── */}
          <Card as="section" aria-label={t("language.label")}>
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("language.label")}</h2>
            <p className="mt-1 text-body text-text-secondary">{t("settings.languageDesc")}</p>
            <div className="mt-4">
              <LanguageToggle />
            </div>
          </Card>

          {/* ── Theme card ── */}
          <Card as="section" aria-label={t("theme.label")}>
            <h2 className="font-display text-h2 font-semibold text-text-primary">{t("theme.label")}</h2>
            <p className="mt-1 text-body text-text-secondary">{t("theme.desc")}</p>
            <div className="mt-4">
              <PrimaryTabs
                tabs={[
                  { id: "light", label: t("theme.light") },
                  { id: "dark", label: t("theme.dark") },
                  { id: "system", label: t("theme.system") },
                ]}
                activeId={theme}
                onChange={(id) => setTheme(id as ThemeChoice)}
                ariaLabel={t("theme.label")}
              />
            </div>
          </Card>
        </div>

        {/* ── Notification settings (full width) ── */}
        <Card as="section" aria-label={t("settings.notifications")} className="mt-section-gap">
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
              <Button
                variant={push.isSubscribed ? "outline" : "primary"}
                onClick={push.isSubscribed ? push.unsubscribe : push.subscribe}
                disabled={push.isLoading}
                className="mt-3"
              >
                {push.isLoading ? t("settings.pushLoading") : push.isSubscribed ? t("settings.pushDisable") : t("settings.pushEnable")}
              </Button>
            )}

            {push.error ? <ErrorState message={push.error} className="mt-2" /> : null}
          </div>

          {!preferencesLoaded ? (
            <div className="mt-4">
              <LoadingSkeleton className="h-8 w-48" ariaLabel={t("settings.prefsLoading")} />
            </div>
          ) : preferencesError ? (
            <ErrorState message={preferencesError} onRetry={loadPreferences} className="mt-4" />
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
        </Card>
      </>
      )}
    </PageShell>
  );
}
