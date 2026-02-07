"use client";

import { Search, X } from "lucide-react";

export interface FilterSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Optional hint shown below the input on focus/desktop */
  hint?: string;
  /** Optional: called when user presses Enter (e.g. apply filters) */
  onSubmit?: () => void;
  /** Input type; "search" for native clear and better mobile UX */
  type?: "text" | "search";
  /** Optional class for the wrapper */
  className?: string;
  /** Optional id for the input (accessibility) */
  id?: string;
}

/**
 * Reusable search input for filter sections. Dynamic placeholder per context
 * (e.g. "Ticket ID, Order ID, title…" for tickets, "Order ID" for orders).
 * Responsive and modern styling.
 */
export function FilterSearchBar({
  value,
  onChange,
  placeholder,
  hint,
  onSubmit,
  type = "search",
  className = "",
  id,
}: FilterSearchBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <div className={`min-w-0 flex-1 w-full sm:min-w-[180px] sm:max-w-[280px] ${className}`}>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-0.5">
        Search
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>
          <Search className="h-4 w-4" />
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow focus:shadow-md"
          aria-label="Search"
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {hint && (
        <p className="mt-1 text-[11px] text-gray-500 hidden sm:block" role="status">
          {hint}
        </p>
      )}
    </div>
  );
}
