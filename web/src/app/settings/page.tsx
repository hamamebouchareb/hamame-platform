"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { apiFetch, ApiError } from "@/lib/api";
import { useApiResource } from "@/lib/useApiResource";
import { usePushSubscription } from "@/lib/usePushSubscription";
import { useToast } from "@/components/Toast";
import { AppHeader, Footer, LoadingSkeleton } from "@/components";
import type { PushPreferences } from "@/lib/types";

const HEADER_NAV = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/qcm", label: "QCM" },
  { href: "/suivi", label: "Suivi" },
  { href: "/revision", label: "Révision" },
  { href: "/notes", label: "Notes" },
  { href: "/subscription", label: "Abonnement" },
];

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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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

const PREFERENCE_ROWS: { key: keyof PushPreferences; label: string; description: string }[] = [
  {
    key: "dailyGoalReminder",
    label: "Rappel objectif quotidien",
    description: "Un rappel le soir si vous n'avez pas atteint votre objectif d'étude.",
  },
  {
    key: "streakAtRisk",
    label: "Série en danger",
    description: "Une alerte si votre série va se rompre si vous n'étudiez pas aujourd'hui.",
  },
  {
    key: "badgeEarned",
    label: "Badge obtenu",
    description: "Envoyé immédiatement quand vous gagnez un nouveau badge.",
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
      setPreferencesError(err instanceof ApiError ? err.message : "Impossible de charger les préférences.");
    } finally {
      setPreferencesLoaded(true);
    }
  }, []);

  /* ── Password change ── */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  async function changePassword() {
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("Le nouveau mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Les mots de passe ne correspondent pas.");
      return;
    }
    setChangingPassword(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success({ title: "Mot de passe mis à jour." });
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Impossible de changer le mot de passe.");
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
      setPreferencesError(err instanceof ApiError ? err.message : "Erreur de sauvegarde.");
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
    if (!fullName.trim()) errors.fullName = "Le nom est requis.";
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
        toast.info({ title: "Aucune modification à sauvegarder." });
        setSavingProfile(false);
        return;
      }

      await apiFetch("/users/me", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      toast.success({ title: "Profil mis à jour." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de sauvegarde.";
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
        <p className="text-meta text-text-secondary">Chargement...</p>
      </main>
    );
  }

  const masterEnabled = preferences?.masterEnabled ?? true;

  return (
    <>
      <AppHeader user={user} onLogout={handleLogout} nav={HEADER_NAV} menuLinks={[
        { href: "/profile", label: "Mon profil" },
        { href: "/settings", label: "Paramètres" },
      ]} />

      <main className="mx-auto w-full max-w-4xl flex-1 px-card-padding py-section-gap">
        <h1 className="font-display text-h1 font-bold text-text-primary">Paramètres</h1>

        <div className="mt-section-gap grid gap-section-gap lg:grid-cols-2">
          {/* ── Personal info card ── */}
          <section aria-label="Informations personnelles" className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
            <h2 className="font-display text-h2 font-semibold text-text-primary">Informations personnelles</h2>

            <div className="mt-4 flex flex-col gap-4">
              {/* Full name */}
              <div>
                <label htmlFor="fullName" className={labelClass}>Nom complet</label>
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
                <label htmlFor="email" className={labelClass}>Email</label>
                <input
                  id="email"
                  type="email"
                  value={user.email ?? "—"}
                  readOnly
                  className={`${inputClass} opacity-60 cursor-not-allowed`}
                />
                <p className="mt-1 text-caption text-text-tertiary">L&apos;email ne peut pas être modifié ici.</p>
              </div>

              {/* Phone (read-only) */}
              <div>
                <label htmlFor="phone" className={labelClass}>Téléphone</label>
                <input
                  id="phone"
                  type="tel"
                  value={user.phone ?? "—"}
                  readOnly
                  className={`${inputClass} opacity-60 cursor-not-allowed`}
                />
                <p className="mt-1 text-caption text-text-tertiary">Le téléphone ne peut pas être modifié ici.</p>
              </div>

              {/* Faculty */}
              <div>
                <label htmlFor="facultyId" className={labelClass}>Faculté</label>
                <select
                  id="facultyId"
                  value={facultyId}
                  onChange={(e) => { setFacultyId(e.target.value); setYearId(""); }}
                  className={inputClass}
                >
                  <option value="">— Aucune —</option>
                  {faculties.data?.faculties.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div>
                <label htmlFor="yearId" className={labelClass}>Année</label>
                <select
                  id="yearId"
                  value={yearId}
                  onChange={(e) => setYearId(e.target.value)}
                  disabled={!facultyId}
                  className={inputClass}
                >
                  <option value="">— Aucune —</option>
                  {years.data?.years.map((y) => (
                    <option key={y.id} value={y.id}>{y.label}</option>
                  ))}
                </select>
                {!facultyId ? <p className={errorTextClass}>Sélectionnez d&apos;abord une faculté.</p> : null}
              </div>

              {/* Wilaya */}
              <div>
                <label htmlFor="wilaya" className={labelClass}>Wilaya</label>
                <select
                  id="wilaya"
                  value={wilaya}
                  onChange={(e) => setWilaya(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Aucune —</option>
                  {WILAYAS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={saveProfile}
                disabled={savingProfile}
                className="mt-2 inline-flex min-h-touch-target items-center justify-center rounded-control bg-accent-primary px-5 text-body font-medium text-background shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
              >
                {savingProfile ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>
          </section>

          {/* ── Password change card ── */}
          <section aria-label="Changer le mot de passe" className="rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
            <h2 className="font-display text-h2 font-semibold text-text-primary">Changer le mot de passe</h2>

            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="current-password" className={labelClass}>Mot de passe actuel</label>
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
                <label htmlFor="new-password" className={labelClass}>Nouveau mot de passe</label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-caption text-text-tertiary">Minimum 8 caractères.</p>
              </div>
              <div>
                <label htmlFor="confirm-password" className={labelClass}>Confirmer le nouveau mot de passe</label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                />
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
                className="mt-2 inline-flex min-h-touch-target items-center justify-center rounded-control bg-accent-primary px-5 text-body font-medium text-background shadow-glow-primary transition hover:brightness-110 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50 disabled:pointer-events-none"
              >
                {changingPassword ? "Mise à jour..." : "Changer le mot de passe"}
              </button>
            </div>
          </section>
        </div>

        {/* ── Notification settings (full width) ── */}
        <section aria-label="Notifications" className="mt-section-gap rounded-card border border-border bg-surface-1 p-card-padding shadow-card">
          <h2 className="font-display text-h2 font-semibold text-text-primary">Notifications</h2>

          <div className="mt-4">
            <p className="text-body text-text-secondary">
              {push.isSupported
                ? push.isSubscribed
                  ? "Cet appareil est abonné aux notifications push."
                  : "Activez les notifications push pour recevoir des rappels même quand Hamame n&apos;est pas ouvert."
                : "Votre navigateur ne supporte pas les notifications push."}
            </p>

            {push.isSupported && (
              <button
                type="button"
                onClick={push.isSubscribed ? push.unsubscribe : push.subscribe}
                disabled={push.isLoading}
                className={
                  push.isSubscribed
                    ? "mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50"
                    : "mt-3 inline-flex min-h-touch-target items-center justify-center rounded-control bg-accent-primary px-4 text-body font-medium text-background shadow-glow-primary transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:opacity-50"
                }
              >
                {push.isLoading ? "Chargement..." : push.isSubscribed ? "Désactiver sur cet appareil" : "Activer sur cet appareil"}
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
              <LoadingSkeleton className="h-8 w-48" ariaLabel="Chargement des préférences" />
            </div>
          ) : preferencesError ? (
            <p role="alert" className="mt-4 rounded-panel border border-danger/30 bg-danger/10 px-3 py-2 text-meta text-danger">
              {preferencesError}
            </p>
          ) : preferences ? (
            <div className="mt-4">
              <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
                <div>
                  <p className="text-body font-medium text-text-primary">Toutes les notifications</p>
                  <p className="mt-0.5 text-meta text-text-secondary">Interrupteur principal — désactive tous les types ci-dessous.</p>
                </div>
                <Switch
                  checked={masterEnabled}
                  disabled={savingKey === "masterEnabled"}
                  onChange={(next) => updatePreference("masterEnabled", next)}
                  label="Toutes les notifications"
                />
              </div>

              <ul className="mt-4 flex flex-col gap-4">
                {PREFERENCE_ROWS.map((row) => (
                  <li key={row.key} className="flex items-center justify-between gap-4 border-t border-border pt-4">
                    <div className={!masterEnabled ? "opacity-50" : undefined}>
                      <p className="text-body font-medium text-text-primary">{row.label}</p>
                      <p className="mt-0.5 text-meta text-text-secondary">{row.description}</p>
                    </div>
                    <Switch
                      checked={preferences[row.key]}
                      disabled={!masterEnabled || savingKey === row.key}
                      onChange={(next) => updatePreference(row.key, next)}
                      label={row.label}
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
