import { LoadingSkeleton } from "@/components";

/**
 * Global loading fallback for route transitions (App Router convention).
 * Server-rendered shell with no copy, so no language context is needed.
 */
export default function RootLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-card-padding py-section-gap" aria-busy="true">
      <LoadingSkeleton className="h-8 w-56" />
      <LoadingSkeleton className="h-5 w-full" />
      <LoadingSkeleton className="h-5 w-11/12" />
      <LoadingSkeleton className="h-24 w-full" />
    </main>
  );
}
