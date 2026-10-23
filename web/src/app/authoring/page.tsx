"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useLanguage } from "@/context/LanguageContext";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
import { Button, ButtonLink, Card, ErrorState, Input, LoadingSkeleton, PageShell, Select, Textarea } from "@/components";
import type { ContributorStats, LessonDraft, LessonVersionDraft, QuestionDraft } from "@/lib/types";

const CONTENT_TIERS = ["official", "hamame_plus"] as const;
const QUESTION_TYPES = ["QCM", "QCS", "QROC"] as const;
const QUESTION_SOURCES = ["hamame_authored", "ai_generated"] as const;
const MIN_OPTIONS = 2;

type QuestionType = (typeof QUESTION_TYPES)[number];

interface OptionRow {
  bodyText: string;
  isCorrect: boolean;
}

function emptyOptionRows(): OptionRow[] {
  return [{ bodyText: "", isCorrect: false }, { bodyText: "", isCorrect: false }];
}

function errorMessage(
  err: unknown,
  t: (key: "auth.genericError") => string
): string {
  return err instanceof ApiError ? err.message : t("auth.genericError");
}

type StatLabelT = (
  key: "authoring.statusDraft" | "authoring.statusPending" | "authoring.statusApproved" | "authoring.statusRejected"
) => string;

function statLabel(status: string, t: StatLabelT): string {
  switch (status) {
    case "draft":
      return t("authoring.statusDraft");
    case "pending_review":
      return t("authoring.statusPending");
    case "approved":
      return t("authoring.statusApproved");
    case "rejected":
      return t("authoring.statusRejected");
    default:
      return status;
  }
}

function StatCards({ title, counts }: { title: string; counts: ContributorStats["lessons"] }) {
  const { t } = useLanguage();
  return (
    <Card>
      <p className="text-meta font-medium text-text-secondary">{title}</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {(["draft", "pending_review", "approved", "rejected"] as const).map((status) => (
          <div key={status} className="rounded-card border border-border bg-surface-2 px-2 py-3 text-center">
            <p className="font-display text-h3 font-semibold text-text-primary">{counts[status]}</p>
            <p className="mt-1 text-caption text-text-tertiary">{statLabel(status, t)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LessonForm() {
  const { t } = useLanguage();
  const [unitId, setUnitId] = useState("");
  const [title, setTitle] = useState("");
  const [contentTier, setContentTier] = useState<(typeof CONTENT_TIERS)[number]>(CONTENT_TIERS[0]);
  const [body, setBody] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [created, setCreated] = useState<{ lesson: LessonDraft; version: LessonVersionDraft } | null>(null);
  const [isSubmittingForReview, setIsSubmittingForReview] = useState(false);
  const [submitForReviewError, setSubmitForReviewError] = useState<string | null>(null);

  async function handleCreateDraft(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const data = await apiFetch<{ lesson: LessonDraft; version: LessonVersionDraft }>("/authoring/lessons", {
        method: "POST",
        body: JSON.stringify({
          unitId,
          title,
          contentTier,
          bodyRichtext: { text: body },
        }),
      });
      setCreated(data);
      setUnitId("");
      setTitle("");
      setContentTier(CONTENT_TIERS[0]);
      setBody("");
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitForReview() {
    if (!created) return;
    setSubmitForReviewError(null);
    setIsSubmittingForReview(true);
    try {
      const data = await apiFetch<{ version: LessonVersionDraft }>(
        `/authoring/lesson/${created.version.id}/submit`,
        { method: "POST" }
      );
      setCreated((prev) => (prev ? { ...prev, version: data.version } : prev));
    } catch (err) {
      setSubmitForReviewError(errorMessage(err, t));
    } finally {
      setIsSubmittingForReview(false);
    }
  }

  return (
    <Card as="section">
      <h3 className="font-display text-h3 font-semibold text-text-primary">{t("authoring.lessonForm")}</h3>

      <form onSubmit={handleCreateDraft} className="mt-3 flex flex-col gap-3">
        <Input
          id="lesson-unit-id"
          label={t("authoring.unitId")}
          type="text"
          required
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          placeholder={t("authoring.pasteUuid")}
        />

        <Input
          id="lesson-title"
          label={t("authoring.titleLabel")}
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <Select
          id="lesson-content-tier"
          label={t("authoring.tierLabel")}
          value={contentTier}
          onChange={(e) => setContentTier(e.target.value as (typeof CONTENT_TIERS)[number])}
        >
          {CONTENT_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </Select>

        <Textarea
          id="lesson-body"
          label={t("authoring.bodyLabel")}
          required
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        {error && <ErrorState message={error} />}

        <Button type="submit" width="full" disabled={isSubmitting}>
          {isSubmitting ? t("authoring.creating") : t("authoring.createDraft")}
        </Button>
      </form>

      {created && (
        <Card variant="elevated" className="mt-4 border-success">
          <p className="text-meta font-medium text-text-primary">{created.lesson.title}</p>
          <p className="mt-1 text-caption text-text-secondary">
            {t("authoring.statusLine", { s: statLabel(created.version.status, t), id: created.version.id })}
          </p>

          {created.version.status !== "pending_review" && (
            <Button variant="outline" width="full" onClick={handleSubmitForReview} disabled={isSubmittingForReview} className="mt-3">
              {isSubmittingForReview ? t("authoring.submitting") : t("authoring.submitReview")}
            </Button>
          )}

          {submitForReviewError && <ErrorState message={submitForReviewError} className="mt-2" />}
        </Card>
      )}
    </Card>
  );
}

function QuestionForm() {
  const { t } = useLanguage();
  const [unitId, setUnitId] = useState("");
  const [type, setType] = useState<QuestionType>("QCM");
  const [source, setSource] = useState<(typeof QUESTION_SOURCES)[number]>(QUESTION_SOURCES[0]);
  const [body, setBody] = useState("");
  const [explanation, setExplanation] = useState("");
  const [options, setOptions] = useState<OptionRow[]>(emptyOptionRows());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [created, setCreated] = useState<QuestionDraft | null>(null);
  const [isSubmittingForReview, setIsSubmittingForReview] = useState(false);
  const [submitForReviewError, setSubmitForReviewError] = useState<string | null>(null);

  const showOptions = type === "QCM" || type === "QCS";

  function updateOption(index: number, patch: Partial<OptionRow>) {
    setOptions((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addOption() {
    setOptions((prev) => [...prev, { bodyText: "", isCorrect: false }]);
  }

  function removeOption(index: number) {
    setOptions((prev) => (prev.length <= MIN_OPTIONS ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handleCreateDraft(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (showOptions && options.some((row) => row.bodyText.trim().length === 0)) {
      setError(t("authoring.everyOption"));
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiFetch<{ question: QuestionDraft }>("/authoring/questions", {
        method: "POST",
        body: JSON.stringify({
          unitId,
          type,
          source,
          bodyRichtext: { text: body },
          explanationRichtext: { text: explanation },
          ...(showOptions
            ? {
                options: options.map((row, index) => ({
                  bodyText: row.bodyText,
                  isCorrect: row.isCorrect,
                  orderIndex: index,
                })),
              }
            : {}),
        }),
      });
      setCreated(data.question);
      setUnitId("");
      setType("QCM");
      setSource(QUESTION_SOURCES[0]);
      setBody("");
      setExplanation("");
      setOptions(emptyOptionRows());
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitForReview() {
    if (!created) return;
    setSubmitForReviewError(null);
    setIsSubmittingForReview(true);
    try {
      const data = await apiFetch<{ question: QuestionDraft }>(`/authoring/question/${created.id}/submit`, {
        method: "POST",
      });
      setCreated(data.question);
    } catch (err) {
      setSubmitForReviewError(errorMessage(err, t));
    } finally {
      setIsSubmittingForReview(false);
    }
  }

  return (
    <Card as="section">
      <h3 className="font-display text-h3 font-semibold text-text-primary">{t("authoring.questionForm")}</h3>

      <form onSubmit={handleCreateDraft} className="mt-3 flex flex-col gap-3">
        <Input
          id="question-unit-id"
          label={t("authoring.unitId")}
          type="text"
          required
          value={unitId}
          onChange={(e) => setUnitId(e.target.value)}
          placeholder={t("authoring.pasteUuid")}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select id="question-type" label="Type" value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          <Select
            id="question-source"
            label="Source"
            value={source}
            onChange={(e) => setSource(e.target.value as (typeof QUESTION_SOURCES)[number])}
          >
            {QUESTION_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>

        <Textarea id="question-body" label={t("authoring.bodyQ")} required rows={3} value={body} onChange={(e) => setBody(e.target.value)} />

        <Textarea
          id="question-explanation"
          label={t("authoring.explanation")}
          required
          rows={3}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
        />

        {showOptions && (
          <div>
            <p className="mb-2 block text-meta font-medium text-text-secondary">Options</p>
            <div className="flex flex-col gap-2">
              {options.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.isCorrect}
                    onChange={(e) => updateOption(index, { isCorrect: e.target.checked })}
                    title={t("authoring.correctTitle")}
                    className="h-5 w-5 shrink-0 accent-[var(--color-accent-primary)]"
                  />
                  <Input
                    id={`question-option-${index}`}
                    type="text"
                    required
                    value={row.bodyText}
                    onChange={(e) => updateOption(index, { bodyText: e.target.value })}
                    placeholder={`Option ${index + 1}`}
                    fieldClassName="flex-1"
                  />
                  {options.length > MIN_OPTIONS && (
                    <Button variant="outline" size="sm" type="button" onClick={() => removeOption(index)}>
                      {t("authoring.remove")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" type="button" onClick={addOption} className="mt-2">
              {t("authoring.addOption")}
            </Button>
          </div>
        )}

        {error && <ErrorState message={error} />}

        <Button type="submit" width="full" disabled={isSubmitting}>
          {isSubmitting ? t("authoring.creating") : t("authoring.createDraft")}
        </Button>
      </form>

      {created && (
        <Card variant="elevated" className="mt-4 border-success">
          <p className="text-meta font-medium text-text-primary">
            {t("authoring.createdLine", { type: created.type, s: statLabel(created.status, t) })}
          </p>
          <p className="mt-1 text-caption text-text-secondary">Question ID: {created.id}</p>

          {created.status !== "pending_review" && (
            <Button variant="outline" width="full" type="button" onClick={handleSubmitForReview} disabled={isSubmittingForReview} className="mt-3">
              {isSubmittingForReview ? t("authoring.submitting") : t("authoring.submitReview")}
            </Button>
          )}

          {submitForReviewError && <ErrorState message={submitForReviewError} className="mt-2" />}
        </Card>
      )}
    </Card>
  );
}

type PayoutStatusT = (
  key: "pay.statusPending" | "pay.statusApproved" | "pay.statusRejected" | "pay.statusPaid"
) => string;

function payoutStatusLabel(status: string, t: PayoutStatusT): string {
  switch (status) {
    case "pending":
      return t("pay.statusPending");
    case "approved":
      return t("pay.statusApproved");
    case "rejected":
      return t("pay.statusRejected");
    case "paid":
      return t("pay.statusPaid");
    default:
      return status;
  }
}

interface PayoutRow {
  id: string;
  amountDzd: number;
  method: string;
  status: string;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
}

function PayoutsCard() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ requests: PayoutRow[] }>("/payouts/mine")
      .then((d) => {
        if (!cancelled) setRows(d.requests);
      })
      .catch(() => {
        if (!cancelled) setLoadError(t("pay.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setActionError(null);
    setCreated(null);
    try {
      await apiFetch("/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountDzd: Number(amount),
          method: "manual",
          note: note.trim() ? note.trim() : null,
        }),
      });
      setCreated(t("pay.submitted"));
      setAmount("");
      setNote("");
      const fresh = await apiFetch<{ requests: PayoutRow[] }>("/payouts/mine");
      setRows(fresh.requests);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setActionError(code === "PENDING_EXISTS" ? t("pay.pendingExists") : errorMessage(err, t));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <h3 className="font-display text-h3 font-semibold text-text-primary">{t("pay.ledger")}</h3>
      <p className="mt-1 text-caption text-text-tertiary">{t("pay.desc")}</p>

      {loadError && <ErrorState message={loadError} className="mt-3" />}
      {rows !== null && rows.length === 0 && (
        <div className="mt-3 rounded-card border border-border bg-surface-2 px-4 py-3">
          <p className="text-body font-medium text-text-primary">{t("pay.empty")}</p>
          <p className="mt-1 text-caption text-text-secondary">{t("pay.emptyDesc")}</p>
        </div>
      )}
      {rows !== null && rows.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-card border border-border bg-surface-2 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-body font-semibold text-text-primary">
                  {row.amountDzd.toLocaleString("fr-DZ")} DZD
                </p>
                <p className="text-caption text-text-secondary">{payoutStatusLabel(row.status, t)}</p>
              </div>
              <p className="mt-1 text-caption text-text-tertiary">
                {new Date(row.createdAt).toLocaleDateString()}
                {row.decisionNote ? ` · ${row.decisionNote}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form className="mt-3 border-t border-border pt-3" onSubmit={handleSubmit}>
        <p className="text-meta font-medium text-text-secondary">{t("pay.new")}</p>
        <Input
          id="payout-amount"
          label={t("pay.amount")}
          type="number"
          min="500"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-2"
        />
        <Textarea
          id="payout-note"
          label={t("pay.note")}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-2 text-text-primary"
        />
        {created && (
          <Card variant="elevated" className="mt-2 border-success">
            <p className="text-meta font-medium text-text-primary">{created}</p>
          </Card>
        )}
        {actionError && <ErrorState message={actionError} className="mt-2" />}
        <Button type="submit" className="mt-3" disabled={isSubmitting || !amount}>
          {isSubmitting ? t("billing.loading") : t("pay.submit")}
        </Button>
      </form>
    </Card>
  );
}

export default function AuthoringPage() {
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const canFetch = isHydrated && !!user;

  const {
    data: stats,
    error: statsError,
    errorCode: statsErrorCode,
    isLoading: statsLoading,
  } = useApiResource<ContributorStats>(canFetch ? "/authoring/me/stats" : null);

  // AuthContext roles (from GET /users/me) — same gate as the dashboard link.
  // The 403 FORBIDDEN path below covers the API rejecting the call regardless.
  const canAuthor =
    !!user && (user.roles.includes("instructor") || user.roles.includes("academic_reviewer"));

  if (!canAuthor || statsErrorCode === "FORBIDDEN") {
    return (
      <PageShell
        user={user}
        isHydrated={isHydrated}
        onLogout={handleLogout}
        width="narrow"
        title={t("authoring.title")}
        loadingLabel={t("billing.loading")}
      >
        <Card className="mt-section-gap">
          <p className="text-body text-text-secondary">{t("authoring.deniedDesc")}</p>
          <ButtonLink href="/dashboard" width="full" className="mt-4">
            {t("authoring.backDashboard")}
          </ButtonLink>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      title={t("authoring.title")}
      loadingLabel={t("billing.loading")}
    >
      <section className="mt-section-gap flex flex-col gap-card-gap">
        {statsLoading && <LoadingSkeleton className="h-20 w-full" ariaLabel={t("authoring.statsLoading")} />}
        {statsError && <ErrorState message={statsError} />}
        {stats && (
          <>
            <StatCards title={t("authoring.lessonsTitle")} counts={stats.lessons} />
            <StatCards title={t("authoring.questionsTitle")} counts={stats.questions} />
          </>
        )}
      </section>

      <div className="mt-section-gap flex flex-col gap-card-gap">
        <LessonForm />
        <QuestionForm />
        <PayoutsCard />
      </div>
    </PageShell>
  );
}
