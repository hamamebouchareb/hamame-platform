import type { AppHeaderNavItem } from "@/components/AppHeader";
import type { UserMenuLink } from "@/components/UserMenu";

/**
 * Single source of truth for the primary navigation.
 *
 * The design-system audit (§4.16) defines the app around exactly five primary
 * tabs: Tableau de bord, QCM, Bibliothèque, Suivi, Révision. Every route renders
 * this same set via the shared <AppHeader>, so the primary nav can never drift
 * per-route again. `active` is computed by AppHeader from the current pathname,
 * so callers must not set it.
 */
export const PRIMARY_NAV: AppHeaderNavItem[] = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/qcm", label: "QCM" },
  { href: "/faculties", label: "Bibliothèque" },
  { href: "/suivi", label: "Suivi" },
  { href: "/revision", label: "Révision" },
];

/**
 * Secondary destinations (avatar menu). Notes and Abonnement are intentionally
 * NOT part of the primary five-tab set — they live here so they remain reachable
 * from every route without making the primary nav route-dependent.
 */
export const SECONDARY_NAV: UserMenuLink[] = [
  { href: "/notes", label: "Notes" },
  { href: "/historique", label: "Historique" },
  { href: "/classement", label: "Classement" },
  { href: "/couverture", label: "Couverture" },
  { href: "/subscription", label: "Abonnement" },
  { href: "/resources", label: "Ressources" },
  { href: "/profile", label: "Mon profil" },
  { href: "/settings", label: "Paramètres" },
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
