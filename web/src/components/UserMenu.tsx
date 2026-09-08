"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "@/context/AuthContext";
import { cx } from "@/lib/cx";

export interface UserMenuLink {
  href: string;
  label: string;
}

export interface UserMenuProps {
  user: AuthUser;
  onLogout: () => void;
  links?: UserMenuLink[];
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const menuItemBase =
  "block w-full rounded-control px-3 py-2 text-left text-body text-text-primary transition hover:bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-3";

/** Avatar button that opens a dropdown with identity, links, and logout. */
export function UserMenu({ user, onLogout, links = [] }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        // The visible full name is hidden below the sm breakpoint (initials-only
        // avatar), which leaves the button with no accessible text on mobile.
        aria-label={`Menu du compte — ${user.fullName}`}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex min-h-touch-target min-w-touch-target items-center justify-center gap-2 rounded-pill border border-border bg-surface-1 px-3 text-body font-medium text-text-primary transition hover:border-border-strong hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring active:bg-surface-2"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-accent-primary font-display text-caption font-bold text-on-accent" aria-hidden>
          {initials(user.fullName)}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{user.fullName}</span>
        <svg viewBox="0 0 20 20" className={cx("h-4 w-4 text-text-tertiary transition", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Menu utilisateur"
          className="absolute right-0 top-full z-30 mt-2 w-60 rounded-card border border-border bg-surface-2 p-1 shadow-card-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-body font-medium text-text-primary">{user.fullName}</p>
            {user.email ? <p className="truncate text-meta text-text-secondary">{user.email}</p> : null}
          </div>
          {user.roles.length > 0 ? (
            <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
              {user.roles.map((role) => (
                <span key={role} className="rounded-pill border border-border bg-surface-3 px-2 py-0.5 text-caption font-medium text-text-secondary">
                  {role}
                </span>
              ))}
            </div>
          ) : null}
          <div className="py-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} role="menuitem" onClick={() => setOpen(false)} className={menuItemBase}>
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className={cx(menuItemBase, "text-danger")}
            >
              Déconnexion
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
