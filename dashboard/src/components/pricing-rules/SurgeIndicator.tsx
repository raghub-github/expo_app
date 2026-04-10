"use client";

import React from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shows surge multiplier (e.g. 1.5×) when not 1. */
export function SurgeIndicator(props: {
  multiplier: number;
  className?: string;
}) {
  const m = Number.isFinite(props.multiplier) ? props.multiplier : 1;
  if (m <= 1 + 1e-6) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900",
        props.className
      )}
      title="Surge active"
    >
      <Zap className="h-3 w-3" aria-hidden />
      {m.toFixed(2)}×
    </span>
  );
}
