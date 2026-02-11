"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { useTicketFilters } from "@/hooks/tickets/useTicketFilters";

/**
 * Collapsible global ticket search for the main nav bar.
 * Renders beside the notification icon: collapsed = search icon only; click to expand and type.
 */
export function TicketSearchInHeader() {
  const { filters, updateFilter } = useTicketFilters();
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
    }
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("[data-ticket-search-wrap]");
      if (!el) setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [expanded]);

  return (
    <div
      data-ticket-search-wrap
      className="flex items-center gap-1 rounded-lg bg-gray-100/80 hover:bg-gray-100 transition-all duration-200 overflow-hidden"
    >
      {expanded ? (
        <>
          <Search className="h-4 w-4 text-gray-500 flex-shrink-0 ml-2.5" />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search tickets..."
            value={filters.searchQuery}
            onChange={(e) => updateFilter("searchQuery", e.target.value)}
            className="w-36 sm:w-44 md:w-56 h-9 bg-transparent border-0 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-0 px-1"
            aria-label="Search tickets"
          />
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200/80 rounded mr-1"
            aria-label="Collapse search"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center justify-center w-9 h-9 text-gray-500 hover:text-gray-700 hover:bg-gray-200/80 rounded-lg transition-colors"
          aria-label="Open ticket search"
        >
          <Search className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
