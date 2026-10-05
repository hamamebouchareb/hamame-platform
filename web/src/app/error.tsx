"use client";

import { useLanguage } from "@/context/LanguageContext";
import { EmptyState, Footer } from "@/components";

/**
 * Branded route crash page (App Router convention). `reset` re-renders the
 * failed segment without a full reload; the dashboard link is the escape
 * hatch. No error text is echoed — details stay in the server logs.
 */
export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();
  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-card-padding py-section-gap">
        <EmptyState
          title={t("errors.crash")}
          description={t("errors.crashDesc")}
          action={{ label: t("common.retry"), onClick: reset }}
        />
      </main>
      <Footer />
    </>
  );
}
