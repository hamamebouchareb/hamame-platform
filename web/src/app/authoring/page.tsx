"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { useApiResource } from "@/lib/useApiResource";
import { apiFetch, ApiError } from "@/lib/api";
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

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
}

function statLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "pending_review":
      return "Pending Review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

function StatCards({ title, counts }: { title: string; counts: ContributorStats["lessons"] }) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {(["draft", "pending_review", "approved", "rejected"] as const).map((status) => (
          <div key={status} className="rounded-lg border border-gray-200 bg-white px-2 py-3 text-center">
            <p className="text-xl font-semibold text-gray-900">{counts[status]}</p>
            <p className="mt-1 text-xs text-gray-500">{statLabel(status)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LessonForm() {
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
      setError(errorMessage(err));
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
      setSubmitForReviewError(errorMessage(err));
    } finally {
      setIsSubmittingForReview(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white px-4 py-4">
      <h3 className="text-base font-semibold text-gray-900">New Lesson Draft</h3>

      <form onSubmit={handleCreateDraft} className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor="lesson-unit-id" className="block text-sm font-medium text-gray-700">
            Unit ID
          </label>
          <input
            id="lesson-unit-id"
            type="text"
            required
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            placeholder="Paste a unit UUID"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="lesson-title" className="block text-sm font-medium text-gray-700">
            Title
          </label>
          <input
            id="lesson-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="lesson-content-tier" className="block text-sm font-medium text-gray-700">
            Content Tier
          </label>
          <select
            id="lesson-content-tier"
            value={contentTier}
            onChange={(e) => setContentTier(e.target.value as (typeof CONTENT_TIERS)[number])}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            {CONTENT_TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {tier}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="lesson-body" className="block text-sm font-medium text-gray-700">
            Body
          </label>
          <textarea
            id="lesson-body"
            required
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {isSubmitting ? "Creating..." : "Create Draft"}
        </button>
      </form>

      {created && (
        <div className="mt-4 rounded-lg bg-green-50 px-3 py-3">
          <p className="text-sm font-medium text-gray-900">{created.lesson.title}</p>
          <p className="mt-1 text-xs text-gray-600">
            Status: {statLabel(created.version.status)} · Version ID: {created.version.id}
          </p>

          {created.version.status !== "pending_review" && (
            <button
              type="button"
              onClick={handleSubmitForReview}
              disabled={isSubmittingForReview}
              className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-50 disabled:opacity-60"
            >
              {isSubmittingForReview ? "Submitting..." : "Submit for Review"}
            </button>
          )}

          {submitForReviewError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitForReviewError}</p>
          )}
        </div>
      )}
    </section>
  );
}

function QuestionForm() {
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
      setError("Every option needs text.");
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
      setError(errorMessage(err));
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
      setSubmitForReviewError(errorMessage(err));
    } finally {
      setIsSubmittingForReview(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white px-4 py-4">
      <h3 className="text-base font-semibold text-gray-900">New Question Draft</h3>

      <form onSubmit={handleCreateDraft} className="mt-3 flex flex-col gap-3">
        <div>
          <label htmlFor="question-unit-id" className="block text-sm font-medium text-gray-700">
            Unit ID
          </label>
          <input
            id="question-unit-id"
            type="text"
            required
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            placeholder="Paste a unit UUID"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="question-type" className="block text-sm font-medium text-gray-700">
              Type
            </label>
            <select
              id="question-type"
              value={type}
              onChange={(e) => setType(e.target.value as QuestionType)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="question-source" className="block text-sm font-medium text-gray-700">
              Source
            </label>
            <select
              id="question-source"
              value={source}
              onChange={(e) => setSource(e.target.value as (typeof QUESTION_SOURCES)[number])}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
            >
              {QUESTION_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="question-body" className="block text-sm font-medium text-gray-700">
            Question Body
          </label>
          <textarea
            id="question-body"
            required
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="question-explanation" className="block text-sm font-medium text-gray-700">
            Explanation
          </label>
          <textarea
            id="question-explanation"
            required
            rows={3}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>

        {showOptions && (
          <div>
            <p className="block text-sm font-medium text-gray-700">Options</p>
            <div className="mt-1 flex flex-col gap-2">
              {options.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.isCorrect}
                    onChange={(e) => updateOption(index, { isCorrect: e.target.checked })}
                    title="Correct answer"
                    className="h-4 w-4"
                  />
                  <input
                    type="text"
                    required
                    value={row.bodyText}
                    onChange={(e) => updateOption(index, { bodyText: e.target.value })}
                    placeholder={`Option ${index + 1}`}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                  {options.length > MIN_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="rounded-lg border border-gray-300 px-2 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addOption}
              className="mt-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-50"
            >
              Add Option
            </button>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {isSubmitting ? "Creating..." : "Create Draft"}
        </button>
      </form>

      {created && (
        <div className="mt-4 rounded-lg bg-green-50 px-3 py-3">
          <p className="text-sm font-medium text-gray-900">
            {created.type} question — Status: {statLabel(created.status)}
          </p>
          <p className="mt-1 text-xs text-gray-600">Question ID: {created.id}</p>

          {created.status !== "pending_review" && (
            <button
              type="button"
              onClick={handleSubmitForReview}
              disabled={isSubmittingForReview}
              className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-50 disabled:opacity-60"
            >
              {isSubmittingForReview ? "Submitting..." : "Submit for Review"}
            </button>
          )}

          {submitForReviewError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{submitForReviewError}</p>
          )}
        </div>
      )}
    </section>
  );
}

export default function AuthoringPage() {
  const { user, isHydrated } = useRequireAuth();
  const canFetch = isHydrated && !!user;

  const {
    data: stats,
    error: statsError,
    errorCode: statsErrorCode,
    isLoading: statsLoading,
  } = useApiResource<ContributorStats>(canFetch ? "/authoring/me/stats" : null);

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-gray-500">Loading...</p>
      </main>
    );
  }

  // AuthContext roles (from GET /users/me) — same gate as the dashboard link.
  // The 403 FORBIDDEN path below covers the API rejecting the call regardless.
  const canAuthor =
    user.roles.includes("instructor") || user.roles.includes("academic_reviewer");

  if (!canAuthor || statsErrorCode === "FORBIDDEN") {
    return (
      <main className="mx-auto min-h-screen w-full max-w-md px-4 py-8">
        <h1 className="text-2xl font-semibold text-gray-900">Author Content</h1>
        <p className="mt-4 text-base text-gray-700">You don&apos;t have permission to access this page.</p>
        <Link
          href="/dashboard"
          className="mt-6 block w-full rounded-lg bg-blue-600 px-4 py-3 text-center text-base font-medium text-white transition hover:bg-blue-700"
        >
          Back to Dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Author Content</h1>

      <section className="mt-6 flex flex-col gap-4">
        {statsLoading && <p className="text-sm text-gray-500">Loading your stats...</p>}
        {statsError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{statsError}</p>}
        {stats && (
          <>
            <StatCards title="Lessons" counts={stats.lessons} />
            <StatCards title="Questions" counts={stats.questions} />
          </>
        )}
      </section>

      <div className="mt-8 flex flex-col gap-6">
        <LessonForm />
        <QuestionForm />
      </div>
    </main>
  );
}
