"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { PRIMARY_NAV, SECONDARY_NAV, isNavActive } from "@/lib/nav";

const STORAGE_KEY = "hamame_sidebar";

type SidebarState = "open" | "collapsed";

function readSidebarState(): SidebarState {
  if (typeof window === "undefined") return "open";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "collapsed" ? "collapsed" : "open";
  } catch {
    return "open";
  }
}

/**
 * Desktop sidebar rail for the dashboard (Kiranism shell idea, Hamame tokens).
 * Same PRIMARY_NAV / SECONDARY_NAV sources as AppHeader — no route or label drift.
 * Mobile keeps the existing AppHeader drawer; this renders `hidden lg:flex` only.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [state, setState] = useState<SidebarState>("open");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(readSidebarState());
    setHydrated(true);
  }, []);

  function toggle() {
    setState((prev) => {
      const next: SidebarState = prev === "open" ? "collapsed" : "open";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private mode — the rail simply resets next visit.
      }
      return next;
    });
  }

  const collapsed = hydrated && state === "collapsed";

  function linkClasses(active: boolean): string {
    return cx(
      "inline-flex min-h-touch-target w-full items-center gap-3 rounded-control px-3 text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
      active
        ? "bg-surface-3 text-accent-soft"
        : "text-text-secondary hover:bg-surface-2 hover:text-text-primary active:bg-surface-2"
    );
  }

  return (
    <aside
      aria-label={t("nav.mainAria")}
      className={cx(
        "sticky top-20 hidden max-h-[calc(100vh-6rem)] shrink-0 flex-col overflow-y-auto rounded-card border border-border bg-surface-1 p-3 shadow-card lg:flex",
        collapsed ? "w-16 items-center" : "w-60"
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("nav.openMenu") : t("nav.closeMenu")}
        className="inline-flex min-h-touch-target min-w-touch-target items-center justify-center self-end rounded-pill text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span aria-hidden>{collapsed ? "→" : "←"}</span>
      </button>

      <nav className="mt-1 flex w-full flex-col gap-1">
        {PRIMARY_NAV.map((item) => {
          const label = t(item.labelKey);
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={linkClasses(active)}
            >
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-surface-2 font-display text-caption font-bold text-accent-soft"
              >
                {label.charAt(0).toUpperCase()}
              </span>
              {collapsed ? null : <span className="min-w-0 truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      <p
        className={cx(
          "mt-4 w-full text-caption font-medium uppercase tracking-wide text-text-tertiary",
          collapsed ? "sr-only" : "px-3"
        )}
      >
        {t("usermenu.menu")}
      </p>
      <nav className="mt-1 flex w-full flex-col gap-1">
        {SECONDARY_NAV.map((item) => {
          const label = t(item.labelKey);
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={cx(linkClasses(active), "text-meta")}
            >
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-surface-2 font-display text-caption font-bold text-text-secondary"
              >
                {label.charAt(0).toUpperCase()}
              </span>
              {collapsed ? null : <span className="min-w-0 truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
