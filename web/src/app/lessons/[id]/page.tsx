"use client";

import { useParams } from "next/navigation";
import { useLanguage } from "@/context/LanguageContext";
import { useAuthedPage } from "@/lib/useAuthedPage";
import { useApiResource } from "@/lib/useApiResource";
import { extractParagraphs } from "@/lib/richtext";
import { Breadcrumb, EmptyState, EnqueueReviewButton, LoadingSkeleton, PageShell, curriculumTrail } from "@/components";
import type { LessonDetail } from "@/lib/types";

export default function LessonDetailPage() {
  const params = useParams<{ id: string }>();
  const { user, isHydrated, handleLogout } = useAuthedPage();
  const { t } = useLanguage();
  const { data: lesson, error, isLoading, refetch } = useApiResource<LessonDetail>(
    isHydrated && user ? `/lessons/${params.id}` : null
  );

  return (
    <PageShell
      user={user}
      isHydrated={isHydrated}
      onLogout={handleLogout}
      width="narrow"
      leading={
        lesson ? (
          <Breadcrumb
            label={t("common.breadcrumb")}
            items={curriculumTrail(t("nav.library"), lesson.context, lesson.title)}
          />
        ) : undefined
      }
    >
      <>
        {isLoading ? (
          <div className="flex flex-col gap-4">
            <LoadingSkeleton className="h-8 w-64" ariaLabel={t("lesson.loading")} />
            <LoadingSkeleton className="h-48 w-full rounded-card" />
          </div>
        ) : null}
        {error ? (
          <div className="rounded-card border border-danger bg-surface-1 p-card-padding">
            <p role="alert" className="text-body text-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={refetch}
              className="mt-3 inline-flex min-h-touch-target w-full items-center justify-center rounded-control border border-border px-4 text-body font-medium text-text-primary transition hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2 sm:w-auto"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : null}
        {!isLoading && !error && !lesson ? (
          <EmptyState
            title={t("lesson.notFound")}
            description={t("lesson.notFoundDesc")}
            action={{ label: t("years.backToLibrary"), href: "/faculties" }}
          />
        ) : null}

        {lesson && (
          <>
            <header>
              <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">{t("lesson.kicker")}</p>
              <h1 className="mt-1 font-display text-h1 font-bold leading-tight text-text-primary">{lesson.title}</h1>
            </header>

            {/* F1 manual revision enrollment — opt-in only; auto-enqueue on
                session submit stays the default mechanism. */}
            <div className="mt-4">
              <EnqueueReviewButton lessonId={lesson.id} />
            </div>

            <article className="mt-section-gap rounded-card-lg border border-border bg-surface-1 p-card-padding shadow-card">
              <div className="flex flex-col gap-4 text-body leading-relaxed text-text-primary">
                {extractParagraphs(lesson.currentVersion.bodyRichtext).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </article>

            <p className="mt-section-gap text-center text-meta text-text-tertiary">
              {t("lesson.readNote")}
            </p>
          </>
        )}
      </>
    </PageShell>
  );
}
