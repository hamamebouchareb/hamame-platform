"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import type { AuthUser } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { UserMenu } from "@/components/UserMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { PRIMARY_NAV, SECONDARY_NAV, isNavActive, type NavKeyEntry } from "@/lib/nav";

export interface AppHeaderNavItem {
  href: string;
  label: string;
  active?: boolean;
}

export interface AppHeaderProps {
  user: AuthUser;
  onLogout: () => void;
  // Custom nav overrides (plain labels, never translated). When omitted, the
  // dictionary-keyed PRIMARY_NAV / SECONDARY_NAV are resolved via useLanguage.
  nav?: AppHeaderNavItem[] | NavKeyEntry[];
  brandHref?: string;
  menuLinks?: { href: string; label: string }[] | NavKeyEntry[];
}

/**
 * Sticky top app bar: Hamame wordmark + primary nav + UserMenu. On mobile, primary
 * nav collapses behind a hamburger button that opens a slide-down drawer.
 */
export function AppHeader({
  user,
  onLogout,
  nav = PRIMARY_NAV,
  brandHref = "/dashboard",
  menuLinks = SECONDARY_NAV,
}: AppHeaderProps) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Resolve dictionary-keyed entries to display labels; plain-label overrides
  // pass through untouched.
  const resolvedNav: AppHeaderNavItem[] = nav.map((item) =>
    "labelKey" in item ? { href: item.href, label: t(item.labelKey) } : item
  );
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
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-card-padding py-3">
        <Link
          href={brandHref}
          className="inline-flex min-h-touch-target shrink-0 items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-accent-primary font-display text-caption font-bold text-on-accent" aria-hidden>
            H
          </span>
          <span className="font-display text-h3 font-bold tracking-tight text-text-primary">Hamame</span>
        </Link>

        {resolvedNav.length > 0 ? (
          <nav aria-label={t("nav.mainAria")} className="hidden min-w-0 flex-1 gap-1 overflow-x-auto md:flex">
            {resolvedNav.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "inline-flex min-h-touch-target shrink-0 items-center rounded-pill px-4 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                    active
                      ? "bg-surface-3 text-accent-soft"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary active:bg-surface-2"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        {/* Hamburger — visible only on mobile */}
        {resolvedNav.length > 0 ? (
          <button
            ref={triggerRef}
            type="button"
            aria-label={drawerOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className="inline-flex min-h-touch-target min-w-touch-target items-center justify-center rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring md:hidden"
          >
            {drawerOpen ? (
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
              </svg>
            )}
          </button>
        ) : null}

        <div className="flex shrink-0 items-center gap-1">
          <NotificationsBell />
          <UserMenu user={user} onLogout={onLogout} links={resolvedMenuLinks} />
        </div>
      </div>

      {/* Mobile nav drawer */}
      {resolvedNav.length > 0 ? (
        <div
          id="mobile-nav-drawer"
          ref={drawerRef}
          role="navigation"
          aria-label={t("nav.mobileAria")}
          className={cx(
            "border-t border-border bg-surface-1 px-card-padding md:hidden",
            drawerOpen ? "block pb-4" : "hidden"
          )}
        >
          <nav className="flex flex-col gap-1 pt-2">
            {resolvedNav.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                  className={cx(
                    "inline-flex min-h-touch-target items-center rounded-control px-4 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                    active
                      ? "bg-surface-3 text-accent-soft"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text-primary active:bg-surface-2"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
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
        className="fixed inset-0 z-10 bg-overlay md:hidden"
      />
    ) : null}
    </>
  );
}
