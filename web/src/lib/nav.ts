import type { I18nKey } from "@/lib/i18n";
import type { IconName } from "@/components/Icon";

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
  icon?: IconName;
}

export const PRIMARY_NAV: NavKeyEntry[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: "dashboard" },
  { href: "/qcm", labelKey: "nav.qcm", icon: "qcm" },
  { href: "/faculties", labelKey: "nav.library", icon: "library" },
  { href: "/suivi", labelKey: "nav.progress", icon: "progress" },
  { href: "/revision", labelKey: "nav.revision", icon: "revision" },
];

export interface NavGroup {
  id: "study" | "community" | "account";
  labelKey: I18nKey;
  items: NavKeyEntry[];
}

/**
 * Secondary destinations, grouped. The sidebar shows each group as a
 * collapsible section (so the rail fits without scrolling) and the mobile
 * drawer lists them under the same headings. Profile, settings and
 * notifications are not here: they live in the avatar menu and the bell.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "study",
    labelKey: "nav.groupStudy",
    items: [
      { href: "/simulations", labelKey: "nav.simulations", icon: "simulations" },
      { href: "/resources", labelKey: "nav.resources", icon: "resources" },
      { href: "/notes", labelKey: "nav.notes", icon: "notes" },
      { href: "/ai-chat", labelKey: "nav.assistant", icon: "ai" },
      { href: "/historique", labelKey: "nav.history", icon: "history" },
      { href: "/couverture", labelKey: "nav.coverage", icon: "coverage" },
    ],
  },
  {
    id: "community",
    labelKey: "nav.groupCommunity",
    items: [
      { href: "/messages", labelKey: "nav.messages", icon: "messages" },
      { href: "/groups", labelKey: "nav.groups", icon: "groups" },
      { href: "/classement", labelKey: "nav.leaderboard", icon: "trophy" },
      { href: "/associations", labelKey: "nav.assoc", icon: "associations" },
      { href: "/internships", labelKey: "nav.internships", icon: "internships" },
    ],
  },
  {
    id: "account",
    labelKey: "nav.groupAccount",
    items: [
      { href: "/wallet", labelKey: "nav.wallet", icon: "wallet" },
      { href: "/subscription", labelKey: "nav.subscription", icon: "subscription" },
      { href: "/offres", labelKey: "nav.offers", icon: "offers" },
      { href: "/points", labelKey: "nav.points", icon: "points" },
    ],
  },
];

export const SECONDARY_NAV: NavKeyEntry[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * Avatar-menu links. Account actions only (logout is a separate control owned
 * by UserMenu, not a nav entry): every other destination lives in the sidebar
 * on desktop and in the mobile drawer on phones.
 */
export const ACCOUNT_NAV: NavKeyEntry[] = [
  { href: "/profile", labelKey: "nav.profile", icon: "profile" },
  { href: "/notifications", labelKey: "nav.notifications", icon: "bell" },
  { href: "/settings", labelKey: "nav.settings", icon: "settings" },
];

/**
 * Admin destinations (admin UI plan, docs/state/11-admin-ui-plan.md).
 * Rendered by AppHeader/Sidebar ONLY for role holders (see adminNavForRoles)
 * — never in PRIMARY_NAV / SECONDARY_NAV, so non-holders see no admin
 * entries anywhere. Labels resolve via useLanguage like every other entry.
 */
export const ADMIN_NAV: NavKeyEntry[] = [
  { href: "/admin/codes", labelKey: "admin.codes", icon: "key" },
  { href: "/admin/faculties", labelKey: "admin.faculties", icon: "building" },
  { href: "/admin/roles", labelKey: "admin.roles", icon: "shield" },
  { href: "/admin/reports", labelKey: "admin.reports", icon: "flag" },
  { href: "/admin/payouts", labelKey: "admin.payouts", icon: "payout" },
  { href: "/admin/wallet", labelKey: "admin.wallet", icon: "wallet" },
  { href: "/admin/associations", labelKey: "admin.assocTitle", icon: "associations" },
];
// NOTE: admin.applications / admin.promos / admin.notifications / admin.jobs
// keys stay in i18n for the pages when they are built; only entries with a
// real page.tsx may appear here (every href below must resolve to a page).

const ADMIN_FAMILY = ["admin", "super_admin"];

/**
 * Visible admin entries for a role list (roles from GET /api/users/me via
 * AuthContext — client-side UX gating only; every endpoint re-checks
 * server-side and 403s regardless). The admin family sees all;
 * support_agent sees /admin/codes and /admin/wallet (matching the
 * activation-code and wallet staff endpoints' gates; pack prices stay
 * admin-only server-side); moderator sees /admin/reports only (matching the
 * moderation endpoints' gate, which support_agent cannot call).
 */
export function adminNavForRoles(roles: string[] | undefined): NavKeyEntry[] {
  if (!roles || roles.length === 0) return [];
  if (roles.some((r) => ADMIN_FAMILY.includes(r))) return ADMIN_NAV;
  const entries: NavKeyEntry[] = [];
  if (roles.includes("support_agent")) {
    entries.push(...ADMIN_NAV.filter((e) => e.href === "/admin/codes" || e.href === "/admin/wallet"));
  }
  if (roles.includes("moderator")) entries.push(...ADMIN_NAV.filter((e) => e.href === "/admin/reports"));
  return entries;
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

/** Destinations the top search bar can jump to (roles gate admin entries). */
export function searchableNav(roles: string[] | undefined): NavKeyEntry[] {
  return [...PRIMARY_NAV, ...SECONDARY_NAV, ...ACCOUNT_NAV, ...adminNavForRoles(roles)];
}
