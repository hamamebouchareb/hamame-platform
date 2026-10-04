import type { I18nKey } from "@/lib/i18n";

/**
 * Single source of truth for the primary navigation.
 *
 * The design-system audit (§4.16) defines the app around exactly five primary
 * tabs. Every route renders this same set via the shared <AppHeader>, so the
 * primary nav can never drift per-route again. `active` is computed by
 * AppHeader from the current pathname, so callers must not set it.
 *
 * Labels are dictionary keys resolved by AppHeader via useLanguage() — never
 * hard-code a display string here, or it will not translate.
 */
export interface NavKeyEntry {
  href: string;
  labelKey: I18nKey;
}

export const PRIMARY_NAV: NavKeyEntry[] = [
  { href: "/dashboard", labelKey: "nav.dashboard" },
  { href: "/qcm", labelKey: "nav.qcm" },
  { href: "/faculties", labelKey: "nav.library" },
  { href: "/suivi", labelKey: "nav.progress" },
  { href: "/revision", labelKey: "nav.revision" },
];

/**
 * Secondary destinations (avatar menu). Notes and Abonnement are intentionally
 * NOT part of the primary five-tab set — they live here so they remain reachable
 * from every route without making the primary nav route-dependent.
 */
export const SECONDARY_NAV: NavKeyEntry[] = [
  { href: "/notes", labelKey: "nav.notes" },
  { href: "/historique", labelKey: "nav.history" },
  { href: "/classement", labelKey: "nav.leaderboard" },
  { href: "/couverture", labelKey: "nav.coverage" },
  { href: "/subscription", labelKey: "nav.subscription" },
  { href: "/resources", labelKey: "nav.resources" },
  { href: "/profile", labelKey: "nav.profile" },
  { href: "/notifications", labelKey: "nav.notifications" },
  { href: "/simulations", labelKey: "nav.simulations" },
  { href: "/settings", labelKey: "nav.settings" },
];

/**
 * Avatar-menu links. Account actions only (profile, settings — logout is a
 * separate control owned by UserMenu, not a nav entry): every other
 * destination lives in the sidebar on desktop and in the mobile drawer on
 * phones, so the menu never duplicates the navigation rail.
 */
export const ACCOUNT_NAV: NavKeyEntry[] = [
  { href: "/profile", labelKey: "nav.profile" },
  { href: "/settings", labelKey: "nav.settings" },
];

/**
 * Admin destinations (admin UI plan, docs/state/11-admin-ui-plan.md).
 * Rendered by AppHeader/Sidebar ONLY for role holders (see adminNavForRoles)
 * — never in PRIMARY_NAV / SECONDARY_NAV, so non-holders see no admin
 * entries anywhere. Labels resolve via useLanguage like every other entry.
 */
export const ADMIN_NAV: NavKeyEntry[] = [
  { href: "/admin/codes", labelKey: "admin.codes" },
  { href: "/admin/faculties", labelKey: "admin.faculties" },
  { href: "/admin/roles", labelKey: "admin.roles" },
  { href: "/admin/instructor-applications", labelKey: "admin.applications" },
  { href: "/admin/promos", labelKey: "admin.promos" },
  { href: "/admin/notifications", labelKey: "admin.notifications" },
  { href: "/admin/jobs", labelKey: "admin.jobs" },
];

const ADMIN_FAMILY = ["admin", "super_admin"];

/**
 * Visible admin entries for a role list (roles from GET /api/users/me via
 * AuthContext — client-side UX gating only; every endpoint re-checks
 * server-side and 403s regardless). support_agent sees /admin/codes only
 * (matching the activation-code endpoints' gate); the admin family sees all.
 */
export function adminNavForRoles(roles: string[] | undefined): NavKeyEntry[] {
  if (!roles || roles.length === 0) return [];
  if (roles.some((r) => ADMIN_FAMILY.includes(r))) return ADMIN_NAV;
  if (roles.includes("support_agent")) return ADMIN_NAV.slice(0, 1);
  return [];
}

/**
 * Returns true when `pathname` is "within" `href`, used to mark the active tab.
 * Exact match, or any nested sub-route (e.g. /qcm/builder → QCM, /faculties/123
 * → Bibliothèque), so nested curriculum pages highlight the right primary tab.
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}
