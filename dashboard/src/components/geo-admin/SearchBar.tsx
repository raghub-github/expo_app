"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const SearchBar = React.memo(function SearchBar(props: {
  onDebouncedChange: (q: string) => void;
  debounceMs?: number;
  placeholder?: string;
  isSearching?: boolean;
  /** Merged onto the outer wrapper; default includes max-w-2xl for standalone use. */
  className?: string;
  /** Seed when the bar mounts (e.g. restore query after switching tabs). */
  initialQuery?: string;
}) {
  const [local, setLocal] = useState(() => props.initialQuery ?? "");
  const ms = props.debounceMs ?? 400;

  useEffect(() => {
    const t = setTimeout(() => props.onDebouncedChange(local.trim()), ms);
    return () => clearTimeout(t);
  }, [local, ms, props.onDebouncedChange]);

  return (
    <div className={cn("relative w-full", props.className || "max-w-2xl")}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={props.placeholder ?? "Search pincode, post office, division, district…"}
        className={cn(
          "w-full min-h-[44px] rounded-xl border border-slate-200/90 bg-white py-2.5 pl-10 pr-10 text-base font-medium text-slate-800 shadow-sm transition sm:min-h-0 sm:text-sm",
          "placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        )}
      />
      {props.isSearching ? (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal-600" aria-label="Searching" />
      ) : null}
    </div>
  );
});
