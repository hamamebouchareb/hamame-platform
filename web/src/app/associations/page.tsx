"use client";

import { useMemo, useState } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { Card, EmptyState, ErrorState, LoadingSkeleton, PageShell, Select } from "@/components";
import { WILAYAS } from "@/lib/wilayas";

// Public association directory (medspark.online community parity). Unauth
// route — the backend group stays public/optionalAuth-free on purpose; the
// AppShell still hydrates the user for the header via its own context.

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
  updatedAt: string;
}

const ASSOC_TYPES = ["student_union", "charity", "club", "network"] as const;
type AssocType = (typeof ASSOC_TYPES)[number];

type AssocTypeT = "assoc.type.student_union" | "assoc.type.charity" | "assoc.type.club" | "assoc.type.network";
 type assocLabelFn = (key: AssocTypeT) => string;

function typeLabel(type: string, t: assocLabelFn): string {
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

export default function AssociationsPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();

  const [wilayaFilter, setWilayaFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssocType | "">("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (wilayaFilter) params.set("wilaya", wilayaFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (verifiedOnly) params.set("verified", "true");
    const qs = params.toString();
    return `/associations${qs ? `?${qs}` : ""}`;
  }, [wilayaFilter, typeFilter, verifiedOnly]);

  const { data, error, isLoading, refetch } = useApiResource<{ associations: AssociationRow[]; pagination: { total: number } }>(query);
  const rows = useMemo(() => data?.associations ?? [], [data]);

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("assoc.title")}
      loadingLabel={t("common.loading")}
    >
      <p className="text-caption text-text-tertiary">{t("assoc.desc")}</p>

      <Card className="mt-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Select id="assoc-wilaya" label={t("assoc.filterWilaya")} value={wilayaFilter} onChange={(e) => setWilayaFilter(e.target.value)}>
              <option value="">{t("assoc.allWilayas")}</option>
              {WILAYAS.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <Select
              id="assoc-type"
              label={t("assoc.filterType")}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as AssocType | "")}
            >
              <option value="">{t("assoc.allTypes")}</option>
              {ASSOC_TYPES.map((type) => (
                <option key={type} value={type}>{typeLabel(type, t)}</option>
              ))}
            </Select>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={verifiedOnly}
          onClick={() => setVerifiedOnly(!verifiedOnly)}
          className={`mt-3 inline-flex items-center gap-2 text-caption ${verifiedOnly ? "text-accent-primary" : "text-text-tertiary"}`}
        >
          <span className={`inline-block h-4 w-4 rounded-full border ${verifiedOnly ? "border-accent-primary bg-accent-primary" : "border-border"}`} />
          {t("assoc.filterVerified")}
        </button>
      </Card>

      {isLoading && <LoadingSkeleton className="mt-4 h-20 w-full" ariaLabel={t("common.loading")} />}
      {error && <ErrorState message={t("assoc.loadFailed")} onRetry={refetch} className="mt-4" />}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyState title={t("assoc.empty")} description={t("assoc.emptyDesc")} action={{ label: t("assoc.allWilayas"), href: "/associations" }} />
      )}

      <ul className="mt-4 flex flex-col gap-card-gap">
        {rows.map((row) => (
          <Card as="li" key={row.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-body font-semibold text-text-primary">{row.name}</p>
              {row.verified && (
                <p className="rounded-full border border-success px-2 py-0.5 text-caption text-success">
                  {t("assoc.verified")}
                </p>
              )}
            </div>
            <p className="mt-1 text-meta text-text-secondary">
              {row.wilaya} · {typeLabel(row.type, t)}
            </p>
            {row.description && <p className="mt-2 text-meta text-text-secondary">{row.description}</p>}
            {row.contactEmail || row.contactPhone ? (
              <div className="mt-3 flex flex-col gap-1">
                {row.contactEmail && (
                  <a
                    href={`mailto:${row.contactEmail}`}
                    className="text-meta text-accent-primary underline underline-offset-2"
                  >
                    {t("assoc.contactEmail")}: {row.contactEmail}
                  </a>
                )}
                {row.contactPhone && (
                  <a
                    href={`tel:${row.contactPhone.replace(/\s+/g, "")}`}
                    className="text-meta text-accent-primary underline underline-offset-2"
                  >
                    {t("assoc.contactPhone")}: {row.contactPhone}
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-3 text-caption text-text-tertiary">{t("assoc.noContact")}</p>
            )}
            {row.socialUrl && (
              <a
                href={row.socialUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2 inline-block text-meta text-accent-primary underline underline-offset-2 break-all"
              >
                {t("assoc.socialLink")}
              </a>
            )}
          </Card>
        ))}
      </ul>
    </PageShell>
  );
}
