"use client";

import { useState } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingSkeleton,
  PageShell,
} from "@/components";
import { Select, Textarea } from "@/components/Field";
import { WILAYAS } from "@/lib/wilayas";

// Admin curation for the public association directory: create entries, edit
// every field inline, and flip the verified stamp (verifiedAt server-side).

interface AssociationRow {
  id: string;
  name: string;
  wilaya: string;
  type: string;
  description: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  socialUrl: string | null;
  verified: boolean;
}

const ASSOC_TYPES = ["student_union", "charity", "club", "network"] as const;
type AssocType = (typeof ASSOC_TYPES)[number];

type AssocTypeT = "assoc.type.student_union" | "assoc.type.charity" | "assoc.type.club" | "assoc.type.network";

function typeLabel(type: string, t: (key: AssocTypeT) => string): string {
  switch (type) {
    case "student_union":
      return t("assoc.type.student_union");
    case "charity":
      return t("assoc.type.charity");
    case "club":
      return t("assoc.type.club");
    case "network":
      return t("assoc.type.network");
    default:
      return type;
  }
}

interface RowDraft {
  name: string;
  wilaya: string;
  type: AssocType;
  description: string;
  contactEmail: string;
  contactPhone: string;
  socialUrl: string;
}

function toDraft(row: AssociationRow): RowDraft {
  return {
    name: row.name,
    wilaya: row.wilaya,
    type: row.type as AssocType,
    description: row.description ?? "",
    contactEmail: row.contactEmail ?? "",
    contactPhone: row.contactPhone ?? "",
    socialUrl: row.socialUrl ?? "",
  };
}

function canManageAssociations(roles: string[] | undefined): boolean {
  if (!roles) return false;
  return roles.includes("admin") || roles.includes("super_admin");
}

export default function AdminAssociationsPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;
  const allowed = canManageAssociations(user?.roles);

  const { data, error, isLoading, refetch } = useApiResource<{ associations: AssociationRow[] }>(
    allowed && canFetch ? "/associations" : null
  );
  const rows = data?.associations ?? [];

  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  // Inline drafts per row — opened by the modifier button, saved as one PATCH.
  const [drafts, setDrafts] = useState<Record<string, RowDraft | undefined>>({});

  function draftValue(row: AssociationRow): RowDraft {
    return drafts[row.id] ?? toDraft(row);
  }

  function setDraft(row: AssociationRow, key: keyof RowDraft, value: string) {
    setDrafts((prev) => ({ ...prev, [row.id]: { ...draftValue(row), [key]: value } }));
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setCreateBusy(true);
    setCreateError(null);
    try {
      await apiFetch("/admin/associations", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") ?? "").trim(),
          wilaya: String(form.get("wilaya") ?? ""),
          type: String(form.get("type") ?? "club"),
          description: String(form.get("description") ?? "").trim() || null,
          contactEmail: String(form.get("contactEmail") ?? "").trim() || null,
          contactPhone: String(form.get("contactPhone") ?? "").trim() || null,
          socialUrl: String(form.get("socialUrl") ?? "").trim() || null,
          verified: form.get("verified") === "on",
        }),
      });
      setNotice(t("admin.assocSaved"));
      refetch();
      e.currentTarget.reset();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : t("admin.assocActionFailed"));
    } finally {
      setCreateBusy(false);
    }
  }

  async function saveRow(row: AssociationRow) {
    setRowBusyId(row.id);
    setRowError(null);
    setNotice(null);
    const d = draftValue(row);
    try {
      await apiFetch(`/admin/associations/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: d.name.trim(),
          wilaya: d.wilaya,
          type: d.type,
          description: d.description.trim() || null,
          contactEmail: d.contactEmail.trim() || null,
          contactPhone: d.contactPhone.trim() || null,
          socialUrl: d.socialUrl.trim() || null,
        }),
      });
      setNotice(t("admin.assocSaved"));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      refetch();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : t("admin.assocActionFailed"));
    } finally {
      setRowBusyId(null);
    }
  }

  async function toggleVerified(row: AssociationRow) {
    setRowBusyId(row.id);
    setRowError(null);
    setNotice(null);
    try {
      await apiFetch(`/admin/associations/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ verified: !row.verified }),
      });
      setNotice(t("admin.assocSaved"));
      refetch();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : t("admin.assocActionFailed"));
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("admin.assocTitle")}
      loadingLabel={t("common.loading")}
    >
      <p className="mt-section-gap text-meta text-text-tertiary">{t("admin.assocNote")}</p>

      {!allowed ? (
        <EmptyState title={t("admin.denied")} description={t("admin.deniedDesc")} action={{ label: t("classement.backToDashboard"), href: "/dashboard" }} />
      ) : (
        <>
          {!isLoading && !error && (
            <p className="mt-2 text-caption text-text-tertiary">{rows.length} fiches</p>
          )}

          <Card className="mt-4">
            <h3 className="font-display text-h3 font-semibold text-text-primary">{t("admin.assocNew")}</h3>
            <form className="mt-3 flex flex-col gap-3" onSubmit={handleCreate}>
              <Input id="assoc-create-name" label={t("admin.assocName")} name="name" required />
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Select id="assoc-create-wilaya" name="wilaya" label={t("admin.assocWilaya")} defaultValue="Alger">
                    {WILAYAS.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex-1">
                  <Select id="assoc-create-type" name="type" label={t("admin.assocType")} defaultValue="club">
                    {ASSOC_TYPES.map((type) => (
                      <option key={type} value={type}>{typeLabel(type, t)}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <Textarea id="assoc-create-desc" name="description" label={t("admin.assocDesc")} rows={3} />
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Input id="assoc-create-email" name="contactEmail" type="email" label={t("admin.assocEmail")} />
                </div>
                <div className="flex-1">
                  <Input id="assoc-create-phone" name="contactPhone" label={t("admin.assocPhone")} />
                </div>
                <div className="flex-1">
                  <Input id="assoc-create-social" name="socialUrl" type="url" placeholder="https://…" label={t("admin.assocSocial")} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-meta text-text-secondary">
                <input type="checkbox" name="verified" className="h-4 w-4" />
                {t("admin.assocVerified")}
              </label>
              {createError && <ErrorState message={createError} />}
              <Button type="submit" disabled={createBusy}>
                {createBusy ? t("common.loading") : t("admin.assocCreate")}
              </Button>
            </form>
          </Card>

          {notice && (
            <Card className="mt-4 border-success">
              <p className="text-meta font-medium text-text-primary">{notice}</p>
            </Card>
          )}

          {isLoading && <LoadingSkeleton className="mt-4 h-20 w-full" ariaLabel={t("common.loading")} />}
          {error && <ErrorState message={error} onRetry={refetch} className="mt-4" />}
          {rowError && <ErrorState message={rowError} className="mt-4" />}

          <ul className="mt-4 flex flex-col gap-card-gap">
            {rows.map((row) => {
              const isDraft = drafts[row.id] !== undefined;
              return (
                <Card as="li" key={row.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body font-semibold text-text-primary">{row.name}</p>
                    <p className="text-caption text-text-secondary">
                      {row.wilaya} · {typeLabel(row.type, t)}
                    </p>
                  </div>
                  <p className="mt-1 text-caption text-text-tertiary">
                    {row.verified ? t("admin.assocVerified") : t("admin.assocToVerify")}
                    {row.contactEmail ? ` · ${row.contactEmail}` : ""}
                    {row.contactPhone ? ` · ${row.contactPhone}` : ""}
                  </p>

                  {row.description && <p className="mt-2 text-meta text-text-secondary">{row.description}</p>}

                  {isDraft && (
                    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                      <Input
                        id={`assoc-name-${row.id}`}
                        label={t("admin.assocName")}
                        value={draftValue(row).name}
                        onChange={(e) => setDraft(row, "name", e.target.value)}
                      />
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="flex-1">
                          <Select
                            id={`assoc-wilaya-${row.id}`}
                            label={t("admin.assocWilaya")}
                            value={draftValue(row).wilaya}
                            onChange={(e) => setDraft(row, "wilaya", e.target.value)}
                          >
                            {WILAYAS.map((w) => (
                              <option key={w} value={w}>{w}</option>
                            ))}
                          </Select>
                        </div>
                        <div className="flex-1">
                          <Select
                            id={`assoc-type-${row.id}`}
                            label={t("admin.assocType")}
                            value={draftValue(row).type}
                            onChange={(e) => setDraft(row, "type", e.target.value as AssocType)}
                          >
                            {ASSOC_TYPES.map((type) => (
                              <option key={type} value={type}>{typeLabel(type, t)}</option>
                            ))}
                          </Select>
                        </div>
                      </div>
                      <Textarea
                        id={`assoc-desc-${row.id}`}
                        label={t("admin.assocDesc")}
                        rows={3}
                        value={draftValue(row).description}
                        onChange={(e) => setDraft(row, "description", e.target.value)}
                      />
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="flex-1">
                          <Input
                            id={`assoc-email-${row.id}`}
                            label={t("admin.assocEmail")}
                            value={draftValue(row).contactEmail}
                            onChange={(e) => setDraft(row, "contactEmail", e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <Input
                            id={`assoc-phone-${row.id}`}
                            label={t("admin.assocPhone")}
                            value={draftValue(row).contactPhone}
                            onChange={(e) => setDraft(row, "contactPhone", e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <Input
                            id={`assoc-social-${row.id}`}
                            label={t("admin.assocSocial")}
                            value={draftValue(row).socialUrl}
                            onChange={(e) => setDraft(row, "socialUrl", e.target.value)}
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="self-start"
                        disabled={rowBusyId === row.id}
                        onClick={() => void saveRow(row)}
                      >
                        {t("admin.assocSave")}
                      </Button>
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (isDraft) {
                          setDrafts((prev) => {
                            const next = { ...prev };
                            delete next[row.id];
                            return next;
                          });
                        } else {
                          setDrafts((prev) => ({ ...prev, [row.id]: toDraft(row) }));
                        }
                      }}
                    >
                      {isDraft ? t("common.cancel") : t("admin.assocEdit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rowBusyId === row.id}
                      onClick={() => void toggleVerified(row)}
                    >
                      {row.verified ? t("admin.assocUnverify") : t("admin.assocVerify")}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </ul>
        </>
      )}
    </PageShell>
  );
}
