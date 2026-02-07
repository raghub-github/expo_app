"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";

interface CollapsibleTableFiltersProps {
  /** Filter controls (dropdowns, dates). Shown when expanded. Filters apply automatically on change. */
  filterContent: React.ReactNode;
  /** Table and any loading overlay. Rendered below the filter bar. */
  children: React.ReactNode;
  /** Optional label for the toggle (default: "Filters") */
  label?: string;
  /** Optional: number of active filters to show on badge */
  activeCount?: number;
  /** Applied filter chips + Clear all, rendered in the same top bar as Filters (no new line) */
  filterChipsSlot?: React.ReactNode;
  /** Optional: actions, rows-per-page, pagination etc. Rendered on the same top bar line (compact). */
  trailingSlot?: React.ReactNode;
}

export function CollapsibleTableFilters({
  filterContent,
  children,
  label = "Filters",
  activeCount = 0,
  filterChipsSlot,
  trailingSlot,
}: CollapsibleTableFiltersProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-200/90 bg-white overflow-hidden shadow-sm ring-1 ring-gray-900/5">
      {/* Top bar: Filters + badge, chips, trailingSlot (actions, rows per page, pagination), chevron — single compact row */}
      <div className="border-b border-gray-200/80 bg-gray-50/60">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 shrink-0 py-1 pr-1 text-left transition-colors hover:bg-gray-100/80 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            aria-expanded={open}
            aria-controls="rider-table-filters-content"
            id="rider-table-filters-toggle"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-500" aria-hidden />
            <span className="text-xs sm:text-sm font-medium text-gray-800">{label}</span>
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 rounded-full bg-blue-100 text-blue-700 text-[10px] sm:text-xs font-semibold">
                {activeCount}
              </span>
            )}
          </button>
          {filterChipsSlot != null && (
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              {filterChipsSlot}
            </div>
          )}
          {trailingSlot != null && (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
              {trailingSlot}
            </div>
          )}
          <span className="flex items-center gap-1 text-gray-500 shrink-0">
            {open ? (
              <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            )}
          </span>
        </div>
        <div
          id="rider-table-filters-content"
          role="region"
          aria-labelledby="rider-table-filters-toggle"
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="px-4 pb-4 pt-1 border-t border-gray-200/60">
              <div className="flex flex-wrap items-end gap-3 pt-3">
                {filterContent}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Table content */}
      <div className="relative">
        {children}
      </div>
    </div>
  );
}
