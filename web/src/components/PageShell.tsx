"use client";

import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import type { AuthUser } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { AppHeader, type AppHeaderProps } from "@/components/AppHeader";
import { BackLink } from "@/components/BackLink";
import { Footer, type FooterLink } from "@/components/Footer";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

/**
 * The app's content-width scale. Three steps only, so navigating between pages
 * never shifts the content column:
 * - `narrow`  — single-column reading and ranked lists
 * - `content` — card grids and curriculum drill-downs
 * - `wide`    — multi-column dashboards with a secondary rail
 */
export type PageWidth = "narrow" | "content" | "wide";

const widthClasses: Record<PageWidth, string> = {
  narrow: "max-w-3xl",
  content: "max-w-4xl",
  wide: "max-w-6xl",
};

export interface PageShellProps {
  /** From `useAuthedPage()`. Null until the auth context hydrates. */
  user: AuthUser | null;
  isHydrated: boolean;
  onLogout: () => void;
  width?: PageWidth;
  /** Renders the shared back affordance above the heading. */
  back?: { href: string; label: ReactNode };
  /** Sits above the back link and the heading. Used for the curriculum trail. */
  leading?: ReactNode;
  /** Small uppercase label above the title (section / curriculum context). */
  kicker?: ReactNode;
  title?: ReactNode;
  /**
   * `hero` is for the five primary-nav landing pages; list and detail pages use
   * `h1`. Both are responsive — see the ramp in the heading below.
   */
  titleSize?: "h1" | "hero";
  description?: ReactNode;
  /** Controls aligned opposite the title (filters, primary CTA). */
  actions?: ReactNode;
  /**
   * Page body. Use the callback form to read the authenticated user — it only
   * runs once `user` is non-null, so no null-checks are needed inside.
   */
  children: ReactNode | ((user: AuthUser) => ReactNode);
  nav?: AppHeaderProps["nav"];
  menuLinks?: AppHeaderProps["menuLinks"];
  footerLinks?: FooterLink[];
  loadingLabel?: string;
  className?: string;
}

/**
 * Standard authenticated page frame: header, width-constrained main, footer, and
 * the pre-hydration loading guard that every page used to hand-roll.
 */
export function PageShell({
  user,
  isHydrated,
  onLogout,
  width = "content",
  back,
  leading,
  kicker,
  title,
  titleSize = "h1",
  description,
  actions,
  children,
  nav,
  menuLinks,
  footerLinks,
  loadingLabel,
  className,
}: PageShellProps) {
  const { t } = useLanguage();

  if (!isHydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center px-card-padding">
        <LoadingSkeleton className="h-8 w-48" ariaLabel={loadingLabel ?? t("common.loading")} />
      </main>
    );
  }

  const hasHeading = kicker !== undefined || title !== undefined || description !== undefined || actions !== undefined;

  return (
    <>
      <AppHeader
        user={user}
        onLogout={onLogout}
        {...(nav !== undefined ? { nav } : {})}
        {...(menuLinks !== undefined ? { menuLinks } : {})}
      />

      <main className={cx("mx-auto w-full flex-1 px-card-padding py-section-gap", widthClasses[width], className)}>
        {leading ? <div className="mb-2">{leading}</div> : null}
        {back ? <BackLink href={back.href}>{back.label}</BackLink> : null}

        {hasHeading ? (
          <header
            className={cx(
              "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
              back ? "mt-2" : null
            )}
          >
            <div className="min-w-0">
              {kicker ? (
                <p className="text-meta font-medium uppercase tracking-wide text-accent-soft">{kicker}</p>
              ) : null}
              {title ? (
                <h1
                  className={cx(
                    "font-display font-bold leading-tight text-text-primary",
                    // Both steps ramp down on small screens: a 48px hero wraps to
                    // three lines on a phone, which buries the content below it.
                    titleSize === "hero" ? "text-h1 md:text-hero" : "text-h2 sm:text-h1",
                    kicker ? "mt-1" : null
                  )}
                >
                  {title}
                </h1>
              ) : null}
              {description ? <p className="mt-2 text-body text-text-secondary">{description}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
          </header>
        ) : null}

        {typeof children === "function" ? children(user) : children}
      </main>

      <Footer {...(footerLinks !== undefined ? { links: footerLinks } : {})} />
    </>
  );
}
