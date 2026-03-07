"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface TablePaginationProps {
  /** 1-based current page */
  page: number;
  /** Number of items per page */
  pageSize: number;
  /** Total number of items across all pages */
  total: number;
  /** Called when user requests a new page (1-based) */
  onPageChange: (page: number) => void;
  /** Optional: disable buttons when loading */
  disabled?: boolean;
  /** Optional: aria label prefix for accessibility */
  ariaLabel?: string;
  /** Optional: use smaller padding and text for single-line header */
  compact?: boolean;
}

/**
 * Reusable pagination for rider dashboard tables. Use above the table (top bar).
 * Renders "Showing X–Y of Z" and Previous / Next. Compact, responsive.
 */
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
  ariaLabel = "Table",
  compact = false,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const wrapClass = compact
    ? "flex flex-wrap items-center justify-end gap-1 sm:gap-1.5 py-0.5 px-1 min-w-0"
    : "flex flex-wrap items-center justify-end gap-2 sm:gap-3 py-1 sm:py-2 px-2 sm:px-3 min-w-0";
  const textClass = compact ? "text-[10px] sm:text-xs text-gray-600 whitespace-nowrap" : "text-xs sm:text-sm text-gray-600 whitespace-nowrap";
  const pageNumClass = compact ? "px-1 text-[10px] sm:text-xs text-gray-500 min-w-[2.5rem] text-center" : "px-1.5 sm:px-2 text-xs sm:text-sm text-gray-500 min-w-[3.5rem] sm:min-w-[4rem] text-center";
  const btnClass = compact
    ? "inline-flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none transition-colors shrink-0 cursor-pointer"
    : "inline-flex items-center justify-center h-7 w-7 sm:h-8 sm:w-8 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:pointer-events-none transition-colors shrink-0 cursor-pointer";
  const iconSize = compact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5 sm:h-4 sm:w-4";

  return (
    <div className={wrapClass} role="navigation" aria-label={`${ariaLabel} pagination`}>
      <span className={textClass}>
        Showing <span className="font-medium text-gray-900">{start}</span>
        –<span className="font-medium text-gray-900">{end}</span> of{" "}
        <span className="font-medium text-gray-900">{total}</span>
      </span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || !canPrev}
          className={btnClass}
          aria-label="Previous page"
        >
          <ChevronLeft className={iconSize} />
        </button>
        <span className={pageNumClass}>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || !canNext}
          className={btnClass}
          aria-label="Next page"
        >
          <ChevronRight className={iconSize} />
        </button>
      </div>
    </div>
  );
}
