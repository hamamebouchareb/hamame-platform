"use client";

import { cx } from "@/lib/cx";

export interface SortOption {
  value: string;
  label: string;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface CurriculumToolbarProps {
  /** Number of items currently visible after search/filter/sort. */
  resultCount: number;
  /** Total before filtering, shown as "X / Y" when it differs from resultCount. */
  totalCount?: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  sortValue: string;
  onSortChange: (value: string) => void;
  sortOptions: SortOption[];
  filterValue?: string;
  onFilterChange?: (value: string) => void;
  filterOptions?: FilterOption[];
  className?: string;
}

const controlClass =
  "h-11 rounded-input border border-border bg-surface-2 px-3 text-body text-text-primary placeholder:text-text-tertiary transition focus:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

/** Search + sort + optional filter bar shared by the curriculum list pages. */
export function CurriculumToolbar({
  resultCount,
  totalCount,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  sortValue,
  onSortChange,
  sortOptions,
  filterValue,
  onFilterChange,
  filterOptions,
  className,
}: CurriculumToolbarProps) {
  return (
    <div
      className={cx(
        "flex flex-col gap-3 rounded-panel border border-border bg-surface-1 p-card-padding shadow-card sm:flex-row sm:items-center",
        className
      )}
    >
      <label className="relative block min-w-0 flex-1">
        <span className="sr-only">{searchPlaceholder ?? "Rechercher"}</span>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder ?? "Rechercher…"}
          className={cx(controlClass, "w-full pl-10")}
        />
        <svg
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        {filterValue !== undefined && onFilterChange && filterOptions && filterOptions.length > 0 ? (
          <label>
            <span className="sr-only">Filtrer</span>
            <select
              value={filterValue}
              onChange={(event) => onFilterChange(event.target.value)}
              className={cx(controlClass, "min-w-[10.5rem]")}
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          <span className="sr-only">Trier</span>
          <select
            value={sortValue}
            onChange={(event) => onSortChange(event.target.value)}
            className={cx(controlClass, "min-w-[10.5rem]")}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <p className="text-meta tabular-nums text-text-tertiary">
          {totalCount !== undefined && totalCount !== resultCount
            ? `${resultCount} / ${totalCount}`
            : `${resultCount} ${resultCount === 1 ? "élément" : "éléments"}`}
        </p>
      </div>
    </div>
  );
}
