"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";
import { useLanguage } from "@/context/LanguageContext";
import { Card } from "@/components/Card";
import { Input, Select } from "@/components/Field";

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
  const { t } = useLanguage();
  const uid = useId();
  return (
    <Card
      className={cx(
        "flex flex-col gap-3 sm:flex-row sm:items-center",
        className
      )}
    >
      <label htmlFor={`${uid}-search`} className="relative block min-w-0 flex-1">
        <span className="sr-only">{searchPlaceholder ?? t("toolbar.search")}</span>
        <Input
          id={`${uid}-search`}
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder ?? t("toolbar.searchEllipsis")}
          className="w-full pl-10"
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
          <label htmlFor={`${uid}-filter`}>
            <span className="sr-only">{t("toolbar.filter")}</span>
            <Select
              id={`${uid}-filter`}
              value={filterValue}
              onChange={(event) => onFilterChange(event.target.value)}
              className="min-w-[10.5rem]"
            >
              {filterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <label htmlFor={`${uid}-sort`}>
          <span className="sr-only">{t("toolbar.sort")}</span>
          <Select
            id={`${uid}-sort`}
            value={sortValue}
            onChange={(event) => onSortChange(event.target.value)}
            className="min-w-[10.5rem]"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <p className="text-meta tabular-nums text-text-tertiary">
          {totalCount !== undefined && totalCount !== resultCount
            ? `${resultCount} / ${totalCount}`
            : t(resultCount === 1 ? "toolbar.itemOne" : "toolbar.itemMany", { count: resultCount })}
        </p>
      </div>
    </Card>
  );
}
