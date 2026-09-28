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
 * Returns true when `pathname` is "within" `href`, used to mark the active tab.
 * Exact match, or any nested sub-route (e.g. /qcm/builder → QCM, /faculties/123
 * → Bibliothèque), so nested curriculum pages highlight the right primary tab.
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}
