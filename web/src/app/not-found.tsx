"use client";

import { useLanguage } from "@/context/LanguageContext";
import { BackLink, EmptyState, Footer } from "@/components";

/**
 * Branded 404 (App Router convention — no route changes needed). Renders
 * inside the root providers, so language works; no auth required and none
 * read, so signed-out visitors get the same page.
 */
export default function NotFound() {
  const { t } = useLanguage();
  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-card-padding py-section-gap">
        <BackLink href="/">{t("errors.backHome")}</BackLink>
        <div className="mt-4">
          <EmptyState
            title={t("errors.notFound")}
            description={t("errors.notFoundDesc")}
            action={{ label: t("classement.backToDashboard"), href: "/dashboard" }}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
