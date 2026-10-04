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
  PageShell,
} from "@/components";
import { Input, Select } from "@/components/Field";

interface FoundUser {
  id: string;
  fullName: string | null;
}

const GRANTABLE = [
  "guest",
  "student_free",
  "student_premium",
  "instructor",
  "academic_reviewer",
  "moderator",
  "support_agent",
  "institution_admin",
  "admin",
  "super_admin",
] as const;

function canManageRoles(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.includes("admin") || roles.includes("super_admin");
}

export default function AdminRolesPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;
  const allowed = canManageRoles(user?.roles);

  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const searchPath =
    allowed && canFetch && searched && query.trim().length >= 3
      ? `/users/search?q=${encodeURIComponent(query.trim())}`
      : null;
  const { data: searchData, error: searchError, isLoading: searchLoading } = useApiResource<{
    users: FoundUser[];
  }>(searchPath);
  const found = useMemo(() => searchData?.users ?? [], [searchData]);

  const [userId, setUserId] = useState("");
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[] | null>(null);
  const [grantName, setGrantName] = useState<string>("instructor");
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [revokeName, setRevokeName] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isSelf = !!user && userId === user.id;
  const selfAdminBlocked =
    isSelf && revokeName !== null && (revokeName === "admin" || revokeName === "super_admin");

  function pick(id: string, name: string | null) {
    setUserId(id);
    setPickedName(name);
    setRoles(null);
    setRevokeName(null);
    setActionError(null);
  }

  async function handleGrant() {
    setActionError(null);
    setWorking(true);
    try {
      const res = await apiFetch<{ user: { id: string; roles: string[] } }>(`/admin/users/${userId}/roles`, {
        method: "POST",
        body: JSON.stringify({ roleName: grantName }),
      });
      setRoles(res.user.roles);
      setConfirmGrant(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t("auth.genericError"));
    } finally {
      setWorking(false);
    }
  }

  async function handleRevoke() {
    if (!revokeName) return;
    setActionError(null);
    setWorking(true);
    try {
      const res = await apiFetch<{ user: { id: string; roles: string[] } }>(
        `/admin/users/${userId}/roles/${revokeName}`,
        { method: "DELETE" }
      );
      setRoles(res.user.roles);
      setRevokeName(null);
      setConfirmRevoke(false);
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
      title={t("admin.roles")}
      loadingLabel={t("common.loading")}
    >
      {!allowed ? (
        <EmptyState title={t("admin.denied")} description={t("admin.deniedDesc")} action={{ label: t("classement.backToDashboard"), href: "/dashboard" }} />
      ) : (
        <>
          <Card className="mt-section-gap">
            <h2 className="font-display text-h3 font-semibold text-text-primary">{t("admin.rolesLookup")}</h2>
            <p className="mt-1 text-meta text-text-tertiary">{t("admin.rolesSearchNote")}</p>
            <div className="mt-4 flex flex-col gap-4">
              <Input
                id="admin-roles-search"
                label={t("admin.rolesSearch")}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearched(false); }}
                placeholder="amina"
              />
              <Button width="full" onClick={() => setSearched(true)} disabled={query.trim().length < 3}>
                {t("admin.rolesSearchGo")}
              </Button>
              {searchError && <ErrorState message={searchError} />}
              {searched && !searchLoading && !searchError && found.length === 0 && (
                <p className="text-meta text-text-secondary">{t("admin.rolesNoMatch")}</p>
              )}
              {found.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {found.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => pick(u.id, u.fullName)}
                        className="inline-flex min-h-touch-target w-full items-center justify-between gap-2 rounded-control border border-border px-4 text-body text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      >
                        <span className="min-w-0 truncate">{u.fullName ?? u.id}</span>
                        <span className="shrink-0 font-mono text-meta text-text-tertiary">{u.id.slice(0, 8)}…</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Input
                id="admin-roles-uuid"
                label={t("admin.rolesUuid")}
                hint={t("admin.rolesUuidHint")}
                value={userId}
                onChange={(e) => { setUserId(e.target.value.trim()); setPickedName(null); setRoles(null); }}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </div>
          </Card>

          {userId && (
            <Card className="mt-4">
              <p className="text-body font-medium text-text-primary">{pickedName ?? userId}</p>
              <p className="mt-1 font-mono text-meta text-text-tertiary">{userId}</p>
              <p className="mt-2 text-meta text-text-secondary">
                {t("admin.rolesCurrent")}: {roles === null ? "—" : roles.length === 0 ? "—" : roles.join(", ")}
              </p>
              {roles === null && <p className="mt-1 text-meta text-text-tertiary">{t("admin.rolesAfterAction")}</p>}

              <div className="mt-4 flex flex-col gap-4">
                <Select id="admin-roles-grant" label={t("admin.rolesGrant")} value={grantName} onChange={(e) => setGrantName(e.target.value)}>
                  {GRANTABLE.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
                <Button width="full" onClick={() => setConfirmGrant(true)} disabled={working}>
                  {t("admin.rolesGrantGo")}
                </Button>

                {roles !== null && roles.length > 0 && (
                  <Select
                    id="admin-roles-revoke"
                    label={t("admin.rolesRevoke")}
                    value={revokeName ?? ""}
                    onChange={(e) => setRevokeName(e.target.value || null)}
                  >
                    <option value="">{t("admin.codesChoose")}</option>
                    {roles.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </Select>
                )}
                {revokeName && (
                  selfAdminBlocked ? (
                    <p className="text-meta text-danger">{t("admin.selfRevokeBlocked")}</p>
                  ) : (
                    <Button variant="outline" width="full" onClick={() => setConfirmRevoke(true)} disabled={working}>
                      {t("admin.rolesRevokeGo")}
                    </Button>
                  )
                )}
              </div>

              {actionError && <ErrorState message={actionError} className="mt-4" />}
            </Card>
          )}

          <ConfirmDialog
            open={confirmGrant}
            title={t("admin.rolesGrant")}
            description={t("admin.rolesGrantConfirm", { role: grantName })}
            confirmLabel={t("admin.rolesGrantGo")}
            cancelLabel={t("common.cancel")}
            isConfirming={working}
            confirmError={actionError}
            onConfirm={handleGrant}
            onCancel={() => { setConfirmGrant(false); setActionError(null); }}
          />

          <ConfirmDialog
            open={confirmRevoke && revokeName !== null}
            title={t("admin.rolesRevoke")}
            description={revokeName ? t("admin.rolesRevokeConfirm", { role: revokeName }) : undefined}
            confirmLabel={t("admin.rolesRevokeGo")}
            cancelLabel={t("common.cancel")}
            tone="danger"
            isConfirming={working}
            confirmError={actionError}
            onConfirm={handleRevoke}
            onCancel={() => { setConfirmRevoke(false); setActionError(null); }}
          />
        </>
      )}
    </PageShell>
  );
}
