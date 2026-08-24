"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

/**
 * Shared "protected page" pattern (same behavior as the original /dashboard page):
 * wait for the auth context to hydrate from localStorage, then redirect to /login if
 * there's no user. Callers should render a loading state while `!isHydrated`.
 */
export function useRequireAuth() {
  const router = useRouter();
  const { user, isHydrated } = useAuth();

  useEffect(() => {
    if (isHydrated && !user) {
      router.replace("/login");
    }
  }, [isHydrated, user, router]);

  return { user, isHydrated };
}
