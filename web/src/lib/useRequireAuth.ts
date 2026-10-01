"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const SKIP_KEY = "hamame_onboarding_skip";

// Routes where the onboarding gate must never fire (public auth flows plus
// the wizard itself — bouncing there would loop).
const GATE_EXEMPT_PREFIXES = ["/login", "/register", "/verify", "/forgot-password", "/reset-password", "/bienvenue"];

function isSkipped(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Shared "protected page" pattern (same behavior as the original /dashboard page):
 * wait for the auth context to hydrate from localStorage, then redirect to /login if
 * there's no user. A signed-in user missing faculty/year is sent to /bienvenue
 * (first-run onboarding) unless they skipped it — settings stays the later edit path.
 */
export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isHydrated } = useAuth();

  useEffect(() => {
    if (!isHydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const incomplete = !user.facultyId || !user.yearId;
    const exempt = GATE_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (incomplete && !exempt && !isSkipped()) {
      router.replace("/bienvenue");
    }
  }, [isHydrated, user, pathname, router]);

  return { user, isHydrated };
}
