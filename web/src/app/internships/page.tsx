"use client";

import { useMemo, useState } from "react";
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
  Select,
  Textarea,
} from "@/components";
import { WILAYAS } from "@/lib/wilayas";

// Student reviews of internship placements (moderated). Read = approved only;
// submit = every signed-in user; /mine shows the author's own rows in every
// status. The moderation itself lives in the shared review queue page.

interface ApprovedReview {
  id: string;
  category: string;
  wilaya: string;
  hospitalName: string;
  serviceName: string | null;
  rating: number;
  content: string;
  reviewedAt: string;
}

interface MineReview {
  id: string;
  category: string;
  wilaya: string;
  hospitalName: string;
  serviceName: string | null;
  rating: number;
  content: string;
  status: string;
  reviewComment: string | null;
  createdAt: string;
}

const CATEGORIES = ["stage", "garde", "ecos"] as const;
type Category = (typeof CATEGORIES)[number];

type CategoryT = "intern.category.stage" | "intern.category.garde" | "intern.category.ecos";
type StatusT = "intern.statusPending" | "intern.statusApproved" | "intern.statusRejected";

function categoryLabel(value: string, t: (key: CategoryT) => string): string {
  switch (value) {
    case "stage":
      return t("intern.category.stage");
    case "garde":
      return t("intern.category.garde");
    case "ecos":
      return t("intern.category.ecos");
    default:
      return value;
  }
}

function statusLabel(value: string, t: (key: StatusT) => string): string {
  switch (value) {
    case "pending_review":
      return t("intern.statusPending");
    case "approved":
      return t("intern.statusApproved");
    case "rejected":
      return t("intern.statusRejected");
    default:
      return value;
  }
}

function submitErrorKey(code: string): "intern.pendingDuplicate" | "intern.actionFailed" {
  return code === "REVIEW_PENDING_FOR_THIS_PLACEMENT" ? "intern.pendingDuplicate" : "intern.actionFailed";
}

export default function InternshipsPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();

  const [wilayaFilter, setWilayaFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "">("");

  const listQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (wilayaFilter) params.set("wilaya", wilayaFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    const qs = params.toString();
    return `/internships/reviews${qs ? `?${qs}` : ""}`;
  }, [wilayaFilter, categoryFilter]);

  const { data, error, isLoading, refetch } = useApiResource<{ reviews: ApprovedReview[]; pagination: { total: number } }>(listQuery);
  const mineState = useApiResource<{ reviews: MineReview[] }>(`/internships/mine`);
  const rows = data?.reviews ?? [];

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSubmitBusy(true);
    setSubmitError(null);
    setNotice(null);
    try {
      await apiFetch("/internships/reviews", {
        method: "POST",
        body: JSON.stringify({
          category: String(form.get("category") ?? "stage"),
          wilaya: String(form.get("wilaya") ?? ""),
          hospitalName: String(form.get("hospitalName") ?? "").trim(),
          serviceName: String(form.get("serviceName") ?? "").trim() || null,
          rating: Number(form.get("rating") ?? 3),
          content: String(form.get("content") ?? "").trim(),
        }),
      });
      setNotice(t("intern.submitted"));
      e.currentTarget.reset();
      void refetch();
      void mineState.refetch();
    } catch (err) {
      const key = submitErrorKey(err instanceof ApiError ? err.code : "");
      setSubmitError(t(key));
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("intern.title")}
      loadingLabel={t("common.loading")}
    >
      <p className="text-caption text-text-tertiary">{t("intern.desc")}</p>

      <Card className="mt-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Select id="intern-wilaya" label={t("intern.filterWilaya")} value={wilayaFilter} onChange={(e) => setWilayaFilter(e.target.value)}>
              <option value="">{t("intern.allWilayas")}</option>
              {WILAYAS.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <Select
              id="intern-category"
              label={t("intern.filterCategory")}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category | "")}
            >
              <option value="">{t("intern.allCategories")}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{categoryLabel(c, t)}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {isLoading && <LoadingSkeleton className="mt-4 h-20 w-full" ariaLabel={t("common.loading")} />}
      {error && <ErrorState message={t("intern.loadFailed")} onRetry={refetch} className="mt-4" />}
      {!isLoading && !error && rows.length === 0 && (
        <EmptyState title={t("intern.empty")} description={t("intern.emptyDesc")} action={{ label: t("intern.allWilayas"), href: "/internships" }} />
      )}

      <ul className="mt-4 flex flex-col gap-card-gap">
        {rows.map((row) => (
          <Card as="li" key={row.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-body font-semibold text-text-primary">
                {row.hospitalName}
                {row.serviceName ? ` — ${row.serviceName}` : ""}
              </p>
              <p className="text-caption text-accent-primary">{"★".repeat(row.rating)}</p>
            </div>
            <p className="mt-1 text-meta text-text-secondary">
              {row.wilaya} · {categoryLabel(row.category, t)}
            </p>
            <p className="mt-2 text-meta text-text-primary">{row.content}</p>
          </Card>
        ))}
      </ul>

      <Card className="mt-6">
        <h3 className="font-display text-h3 font-semibold text-text-primary">{t("intern.new")}</h3>
        <p className="mt-1 text-caption text-text-tertiary">{t("intern.newDesc")}</p>
        <form className="mt-3 flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Select id="intern-new-category" name="category" label={t("intern.filterCategory")} defaultValue="stage">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{categoryLabel(c, t)}</option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <Select id="intern-new-wilaya" name="wilaya" label={t("intern.filterWilaya")} defaultValue="Alger">
                {WILAYAS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </Select>
            </div>
            <div className="flex-1">
              <Select id="intern-new-rating" name="rating" label={t("intern.ratingLabel")} defaultValue="4">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </div>
          </div>
          <Input id="intern-new-hospital" name="hospitalName" label={t("intern.hospital")} required />
          <Input id="intern-new-service" name="serviceName" label={t("intern.service")} />
          <Textarea id="intern-new-content" name="content" label={t("intern.content")} rows={4} required />
          {notice && (
            <Card variant="elevated" className="border-success">
              <p className="text-meta font-medium text-text-primary">{notice}</p>
            </Card>
          )}
          {submitError && <ErrorState message={submitError} />}
          <Button type="submit" disabled={submitBusy}>
            {submitBusy ? t("common.loading") : t("intern.submit")}
          </Button>
        </form>
      </Card>

      <Card className="mt-4">
        <h3 className="font-display text-h3 font-semibold text-text-primary">{t("intern.mine")}</h3>
        {mineState.error && <ErrorState message={t("intern.loadFailed")} className="mt-3" />}
        {mineState.isLoading && <LoadingSkeleton className="mt-3 h-10 w-full" ariaLabel={t("common.loading")} />}
        {mineState.data && mineState.data.reviews.length === 0 && (
          <p className="mt-3 text-caption text-text-secondary">{t("intern.mineEmpty")}</p>
        )}
        <ul className="mt-3 flex flex-col gap-2">
          {(mineState.data?.reviews ?? []).map((row) => (
            <li key={row.id} className="rounded-card border border-border bg-surface-2 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-meta font-semibold text-text-primary">
                  {row.hospitalName}{row.serviceName ? ` — ${row.serviceName}` : ""} · {categoryLabel(row.category, t)}
                </p>
                <p className="text-caption text-text-secondary">{statusLabel(row.status, t)}</p>
              </div>
              {row.status === "rejected" && row.reviewComment && (
                <p className="mt-1 text-caption text-danger">{row.reviewComment}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </PageShell>
  );
}
