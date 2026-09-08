"use client";

import { cx } from "@/lib/cx";
import { EmptyState } from "@/components/EmptyState";

export interface EarnedBadge {
  id: string;
  name: string;
  criteria: { type?: string } & Record<string, unknown>;
  earnedAt: string;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-DZ", { dateStyle: "medium" });
}

/** Per-criteria-type glyph. aria-hidden — the badge name carries the meaning. */
function BadgeIcon({ type }: { type?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-accent-primary/15 text-accent-soft">
      {type === "streak" ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...common} aria-hidden>
          <path d="M12 3c1.5 3-1 4.5-1 7a4 4 0 008 .5c1.5 5.5-2.5 10.5-7 10.5S4.5 17 5.5 12c.8 1.2 2 1.8 3 1.5C7 10 8 5.5 12 3z" />
        </svg>
      ) : type === "accuracy" ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...common} aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...common} aria-hidden>
          <circle cx="12" cy="9" r="5.5" />
          <path d="M8.5 13.5L7 21l5-2.5L17 21l-1.5-7.5" />
        </svg>
      )}
    </span>
  );
}

/**
 * Horizontal badge shelf for the profile page. Renders only earned badges
 * (GET /api/badges/me); an empty state keeps free-tier accounts from seeing a
 * dead section. Scrolls horizontally rather than wrapping so a large collection
 * can never reflow the page layout.
 */
export function BadgeShelf({
  badges,
  loading,
  className,
}: {
  badges: EarnedBadge[];
  loading?: boolean;
  className?: string;
}) {
  return (
    <section aria-label="Badges" className={cx("mt-section-gap", className)}>
      <h2 className="font-display text-h2 font-semibold text-text-primary">Badges</h2>
      {loading ? (
        <div className="mt-3 flex gap-3 overflow-hidden" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="hamame-skeleton h-24 w-40 shrink-0 rounded-card" />
          ))}
        </div>
      ) : badges.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Aucun badge pour l'instant"
            description="Terminez des sessions QCM et gardez votre série pour débloquer vos premiers badges."
            action={{ label: "Créer une session QCM", href: "/qcm" }}
          />
        </div>
      ) : (
        <ul className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {badges.map((badge) => (
            <li
              key={badge.id}
              className="flex w-44 shrink-0 items-center gap-3 rounded-card border border-border bg-surface-1 p-3 shadow-card"
            >
              <BadgeIcon type={badge.criteria?.type} />
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-text-primary">{badge.name}</p>
                <p className="text-meta text-text-tertiary">Obtenu le {formatDateShort(badge.earnedAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
