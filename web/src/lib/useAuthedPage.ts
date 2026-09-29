"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useRequireAuth } from "@/lib/useRequireAuth";

/**
 * Everything an authenticated page needs from the auth layer, in one call:
 * the hydration-aware user from useRequireAuth plus the logout handler that
 * every page previously redeclared.
 *
 * `user`/`isHydrated` are returned (not consumed internally) because pages must
 * still gate their data fetching on them — `useApiResource(canFetch ? path : null)`.
 */
export function useAuthedPage() {
  const router = useRouter();
  const { logout } = useAuth();
  const { user, isHydrated } = useRequireAuth();

  const handleLogout = useCallback(() => {
    logout();
    router.push("/login");
  }, [logout, router]);

  return { user, isHydrated, handleLogout };
}
