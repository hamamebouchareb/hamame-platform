"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { BrandLockup } from "@/components/BrandMark";
import { Icon } from "@/components/Icon";
import { NAV_GROUPS, PRIMARY_NAV, isNavActive, type NavGroup, type NavKeyEntry } from "@/lib/nav";

const STORAGE_KEY = "hamame_sidebar";
const GROUPS_KEY = "hamame_nav_groups";

type SidebarState = "open" | "collapsed";

function readSidebarState(): SidebarState {
  if (typeof window === "undefined") return "open";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "collapsed" ? "collapsed" : "open";
  } catch {
    return "open";
  }
}

function readOpenGroups(pathname: string): Record<string, boolean> {
  const defaults: Record<string, boolean> = { study: true, community: false, account: false };
  for (const group of NAV_GROUPS) {
    if (group.items.some((item) => isNavActive(pathname, item.href))) defaults[group.id] = true;
  }
  try {
    const raw = window.localStorage.getItem(GROUPS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Record<string, boolean>) };
  } catch {
    return defaults;
  }
}

function NavRow({
  item,
  collapsed,
  dense,
}: {
  item: NavKeyEntry;
  collapsed: boolean;
  dense?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const label = t(item.labelKey);
  const active = isNavActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cx(
        "inline-flex min-h-touch-target w-full items-center gap-3 rounded-control px-2.5 font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
        dense ? "text-meta" : "text-body",
        collapsed ? "justify-center px-0" : null,
        active
          ? "bg-surface-3 text-accent-soft"
          : "text-text-secondary hover:bg-surface-2 hover:text-text-primary active:bg-surface-2"
      )}
    >
      {item.icon ? (
        <Icon name={item.icon} size={18} className="shrink-0" />
      ) : (
        <span className="h-[18px] w-[18px] shrink-0" />
      )}
      {collapsed ? null : <span className="min-w-0 truncate">{label}</span>}
    </Link>
  );
}

function GroupSection({
  group,
  collapsed,
  open,
  onToggle,
}: {
  group: NavGroup;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const headingId = `nav-group-${group.id}`;
  const hasActive = group.items.some((item) => isNavActive(pathname, item.href));
  const [flyout, setFlyout] = useState(false);

  if (collapsed) {
    return (
      <div
        className="relative"
        onMouseEnter={() => setFlyout(true)}
        onMouseLeave={() => setFlyout(false)}
      >
        <button
          type="button"
          aria-expanded={flyout}
          title={t(group.labelKey)}
          aria-label={t(group.labelKey)}
          onClick={() => setFlyout((v) => !v)}
          className={cx(
            "inline-flex min-h-touch-target w-full items-center justify-center rounded-control text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
            hasActive ? "text-accent-soft" : null
          )}
        >
          <Icon
            name={group.id === "study" ? "qcm" : group.id === "community" ? "groups" : "wallet"}
            size={18}
          />
        </button>
        {flyout ? (
          <div className="absolute left-full top-0 z-40 ml-2 w-52 rounded-card border border-border bg-surface-1 p-2 shadow-card">
            <p className="px-2 pb-1 text-caption font-medium uppercase tracking-wide text-text-tertiary">
              {t(group.labelKey)}
            </p>
            {group.items.map((item) => (
              <NavRow key={item.href} item={item} collapsed={false} dense />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={headingId}
        onClick={onToggle}
        className="flex min-h-10 w-full items-center justify-between rounded-control px-2.5 text-caption font-medium uppercase tracking-wide text-text-tertiary transition hover:bg-surface-2 hover:text-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span>{t(group.labelKey)}</span>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} />
      </button>
      {open ? (
        <nav id={headingId} className="mt-0.5 flex flex-col gap-0.5">
          {group.items.map((item) => (
            <NavRow key={item.href} item={item} collapsed={false} dense />
          ))}
        </nav>
      ) : null}
    </div>
  );
}

/**
 * Desktop navigation rail. Width matches body padding-left exactly so collapsing
 * does not leave a gap (the previous left-3 + w-60 vs 17rem padding mismatch).
 */
export function Sidebar({ adminNav = [] }: { adminNav?: NavKeyEntry[] }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [state, setState] = useState<SidebarState>("open");
  const stateRef = useRef<SidebarState>("open");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    study: true,
    community: false,
    account: false,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- localStorage unavailable during SSR */
  useEffect(() => {
    const stored = readSidebarState();
    stateRef.current = stored;
    setState(stored);
    setOpenGroups(readOpenGroups(pathname));
    try {
      document.documentElement.dataset.sidebar = stored;
    } catch {
      // ignore
    }
    // Only hydrate from storage once; later path changes keep the user's toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function apply(next: SidebarState) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.dataset.sidebar = next;
    } catch {
      // Private mode — the rail simply resets next visit.
    }
    return next;
  }

  function toggle() {
    const next: SidebarState = stateRef.current === "open" ? "collapsed" : "open";
    stateRef.current = next;
    apply(next);
    setState(next);
  }

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        window.localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const collapsed = state === "collapsed";

  return (
    <aside
      data-hamame-sidebar=""
      {...(collapsed ? { "data-collapsed": "" } : {})}
      aria-label={t("nav.mainAria")}
      className={cx(
        "fixed inset-y-0 left-0 z-30 hidden flex-col overflow-x-hidden border-r border-border bg-surface-1 transition-[width] duration-200 ease-standard lg:flex",
        collapsed ? "w-[4.5rem]" : "w-64"
      )}
    >
      <div className={cx("flex h-[3.75rem] shrink-0 items-center gap-1 border-b border-border", collapsed ? "justify-center px-2" : "px-3")}>
        {collapsed ? null : <BrandLockup href="/dashboard" size={28} className="min-w-0 flex-1" />}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          title={collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-text-secondary transition hover:bg-surface-2 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Icon name="panelLeft" size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        <nav className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavRow key={item.href} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <div className="mt-2 flex flex-col gap-1">
          {NAV_GROUPS.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              collapsed={collapsed}
              open={openGroups[group.id] !== false}
              onToggle={() => toggleGroup(group.id)}
            />
          ))}
        </div>

        {adminNav.length > 0 ? (
          <div className="mt-2 border-t border-border pt-2">
            {collapsed ? (
              <p className="sr-only">{t("admin.section")}</p>
            ) : (
              <p className="px-2.5 pb-1 text-caption font-medium uppercase tracking-wide text-text-tertiary">
                {t("admin.section")}
              </p>
            )}
            <nav className="flex flex-col gap-0.5">
              {adminNav.map((item) => (
                <NavRow key={item.href} item={item} collapsed={collapsed} dense />
              ))}
            </nav>
          </div>
        ) : null}
      </div>

    </aside>
  );
}
