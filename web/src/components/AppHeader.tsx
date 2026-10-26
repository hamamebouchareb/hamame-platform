"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import type { AuthUser } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme, type ThemeChoice } from "@/context/ThemeContext";
import { UserMenu } from "@/components/UserMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { AskHamameButton } from "@/components/AskHamame";
import { BrandLockup } from "@/components/BrandMark";
import { AppSearch } from "@/components/AppSearch";
import { MessengerDock } from "@/components/MessengerDock";
import { Icon } from "@/components/Icon";
import { ACCOUNT_NAV, NAV_GROUPS, PRIMARY_NAV, adminNavForRoles, isNavActive, type NavKeyEntry } from "@/lib/nav";
import { Sidebar } from "@/components/layout/Sidebar";

export interface AppHeaderNavItem {
  href: string;
  label: string;
  active?: boolean;
}

export interface AppHeaderProps {
  user: AuthUser;
  onLogout: () => void;
  // Custom nav overrides (plain labels, never translated). When omitted, the
  // dictionary-keyed PRIMARY_NAV / ACCOUNT_NAV are resolved via useLanguage.
  // SECONDARY_NAV renders in the sidebar (desktop) and the mobile drawer —
  // never in the avatar menu, which stays account-only.
  nav?: AppHeaderNavItem[] | NavKeyEntry[];
  brandHref?: string;
  menuLinks?: { href: string; label: string }[] | NavKeyEntry[];
}

const THEME_CYCLE: Record<ThemeChoice, { next: ThemeChoice; glyph: string; labelKey: "theme.light" | "theme.dark" | "theme.system" }> = {
  light: { next: "dark", glyph: "☀", labelKey: "theme.light" },
  dark: { next: "system", glyph: "☾", labelKey: "theme.dark" },
  system: { next: "light", glyph: "◐", labelKey: "theme.system" },
};

/** Compact header theme control: one tap cycles Clair → Sombre → Système.
 *  The full three-way choice lives in settings; this is the quick path. */
function ThemeCycleButton({ theme, onCycle }: { theme: ThemeChoice; onCycle: (next: ThemeChoice) => void }) {
  const { t } = useLanguage();
  const current = THEME_CYCLE[theme];
  return (
    <button
      type="button"
      onClick={() => onCycle(current.next)}
      aria-label={`${t("theme.label")} — ${t(current.labelKey)}`}
      title={`${t("theme.label")} — ${t(current.labelKey)}`}
      className="inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span aria-hidden className="text-body leading-none">
        {current.glyph}
      </span>
    </button>
  );
}

/**
 * Sticky top app bar: Hamame wordmark + primary nav + UserMenu. On mobile the five
 * primary tabs stay reachable in a fixed bottom bar (the hamburger drawer remains
 * for the same links when the bar is covered). The bar is a sibling of <header>,
 * never a child: backdrop-blur on the header would trap a fixed descendant.
 */
export function AppHeader({
  user,
  onLogout,
  nav = PRIMARY_NAV,
  brandHref = "/dashboard",
  menuLinks = ACCOUNT_NAV,
}: AppHeaderProps) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Resolve dictionary-keyed entries to display labels; plain-label overrides
  // pass through untouched.
  const resolvedNav: AppHeaderNavItem[] = nav.map((item) =>
    "labelKey" in item ? { href: item.href, label: t(item.labelKey) } : item
  );
  // Admin destinations: visible only to role holders. Server-side role checks
  // stay the source of truth — this is UX only.
  const visibleAdminNav = adminNavForRoles(user.roles);
  const resolvedMenuLinks: { href: string; label: string }[] = menuLinks.map((link) =>
    "labelKey" in link ? { href: link.href, label: t(link.labelKey) } : link
  );

  // While the drawer is open it behaves modally: Escape closes and returns focus to
  // the hamburger trigger, and Tab/Shift+Tab wrap within the drawer's own links so
  // focus cannot leak into the page content behind it.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active !== null && drawer.contains(active);
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    // Move focus into the drawer as soon as it renders so keyboard users start at
    // the first link instead of staying on the trigger.
    const raf = requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>("a[href], button")?.focus();
    });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [drawerOpen]);

  return (
    <>
    <header className="sticky top-0 z-20 border-b border-border bg-surface-1/95 backdrop-blur">
      <div className="flex w-full items-center gap-2 px-card-padding py-2.5 lg:gap-3">
        <BrandLockup href={brandHref} size={28} className="lg:hidden" />

        {resolvedNav.length > 0 ? (
          <button
            ref={triggerRef}
            type="button"
            aria-label={drawerOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className="inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:hidden"
          >
            {drawerOpen ? <Icon name="close" size={20} /> : <Icon name="panelLeft" size={20} />}
          </button>
        ) : null}

        {resolvedNav.length > 0 ? (
          <AppSearch roles={user.roles} className="hidden min-w-0 flex-1 md:block" />
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          {resolvedNav.length > 0 ? (
            <button
              type="button"
              className="inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring md:hidden"
              aria-label={t("nav.searchOpen")}
              aria-expanded={mobileSearch}
              onClick={() => setMobileSearch((v) => !v)}
            >
              <Icon name="search" size={20} />
            </button>
          ) : null}
          <AskHamameButton />
          {resolvedNav.length > 0 ? <MessengerDock userId={user.id} /> : null}
          <ThemeCycleButton theme={theme} onCycle={setTheme} />
          <NotificationsBell />
          <UserMenu user={user} onLogout={onLogout} links={resolvedMenuLinks} />
        </div>
      </div>
      {mobileSearch && resolvedNav.length > 0 ? (
        <div className="border-t border-border px-card-padding py-2 md:hidden">
          <AppSearch roles={user.roles} />
        </div>
      ) : null}

      {/* Mobile nav drawer */}
      {resolvedNav.length > 0 ? (
        <div
          id="mobile-nav-drawer"
          ref={drawerRef}
          role="navigation"
          aria-label={t("nav.mobileAria")}
          className={cx(
            "border-t border-border bg-surface-1 px-card-padding lg:hidden",
            drawerOpen ? "block pb-4" : "hidden"
          )}
        >
          <nav className="flex flex-col gap-1 pt-2">
            {PRIMARY_NAV.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                  className={cx(
                    "inline-flex min-h-touch-target items-center gap-3 rounded-control px-3 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                    active
                      ? "bg-surface-3 text-accent-soft"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary active:bg-surface-2"
                  )}
                >
                  {item.icon ? <Icon name={item.icon} size={18} /> : null}
                  {t(item.labelKey)}
                </Link>
              );
            })}
            {NAV_GROUPS.map((group) => (
              <div key={group.id}>
                <p className="px-3 pb-1 pt-3 text-caption font-medium uppercase tracking-wide text-text-tertiary">
                  {t(group.labelKey)}
                </p>
                {group.items.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setDrawerOpen(false)}
                      className={cx(
                        "inline-flex min-h-touch-target w-full items-center gap-3 rounded-control px-3 text-meta font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                        active
                          ? "bg-surface-3 text-accent-soft"
                          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary active:bg-surface-2"
                      )}
                    >
                      {item.icon ? <Icon name={item.icon} size={18} /> : null}
                      {t(item.labelKey)}
                    </Link>
                  );
                })}
              </div>
            ))}
            {visibleAdminNav.length > 0 ? (
              <div>
                <p className="px-3 pb-1 pt-3 text-caption font-medium uppercase tracking-wide text-text-tertiary">
                  {t("admin.section")}
                </p>
                {visibleAdminNav.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setDrawerOpen(false)}
                      className={cx(
                        "inline-flex min-h-touch-target w-full items-center gap-3 rounded-control px-3 text-meta font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                        active
                          ? "bg-surface-3 text-accent-soft"
                          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary active:bg-surface-2"
                      )}
                    >
                      {item.icon ? <Icon name={item.icon} size={18} /> : null}
                      {t(item.labelKey)}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>

    {/* Modal backdrop — a sibling of <header>, NOT a child: the header's backdrop-blur
        makes it the containing block for fixed descendants, which would clip a fixed
        inset-0 overlay to just the header box. Clicking it closes the drawer. */}
    {drawerOpen ? (
      <div
        aria-hidden
        onClick={() => setDrawerOpen(false)}
        className="fixed inset-0 z-10 bg-overlay lg:hidden"
      />
    ) : null}

    {resolvedNav.length > 0 ? <Sidebar adminNav={visibleAdminNav} /> : null}

    {resolvedNav.length > 0 ? (
      <nav
        data-hamame-bottom-nav
        aria-label={t("nav.mainAria")}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-1/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {PRIMARY_NAV.map((item) => {
            const active = isNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-center text-caption font-medium leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  active ? "text-accent-soft" : "text-text-secondary"
                )}
              >
                {item.icon ? <Icon name={item.icon} size={18} /> : null}
                <span className="line-clamp-1">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    ) : null}
    </>
  );
}
