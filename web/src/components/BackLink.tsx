"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Consistent back affordance for drill pages (Task 3b). Prefers in-app
 * history-back so "Retour" returns where the student came from; falls back
 * to the hard href when there is no in-app history (direct landing), where
 * router.back() would silently do nothing.
 */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      aria-label="Retour"
      onClick={(event) => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          event.preventDefault();
          router.back();
        }
      }}
      className="inline-flex min-h-touch-target items-center gap-1 text-meta font-medium text-text-secondary transition hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span aria-hidden>←</span> {children}
    </Link>
  );
}
