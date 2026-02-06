"use client";

import { X, FilterX } from "lucide-react";

export interface FilterChipItem {
  id: string;
  label: string;
}

interface FilterChipsProps {
  chips: FilterChipItem[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  /** When true, render without extra wrapper/border for use inside the table top bar (same row as Filters) */
  inline?: boolean;
}

export function FilterChips({ chips, onRemove, onClearAll, inline = false }: FilterChipsProps) {
  if (chips.length === 0) return null;

  const content = (
    <>
      {chips.map((chip) => (
        <span
          key={chip.id}
          className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-lg bg-white border border-gray-200 text-sm text-gray-800 shadow-sm ring-1 ring-gray-900/5"
        >
          <span className="max-w-[160px] sm:max-w-[180px] truncate">{chip.label}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(chip.id); }}
            className="flex-shrink-0 p-0.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label={`Remove ${chip.label}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClearAll(); }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <FilterX className="h-3.5 w-3.5" />
        Clear all
      </button>
    </>
  );

  if (inline) {
    return <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{content}</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-200/80 bg-gray-50/40">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Applied:</span>
      {content}
    </div>
  );
}
