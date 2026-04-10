"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type PricingBadgeLine = {
  /** Short label, e.g. "Food" */
  label: string;
  /** Human summary, e.g. "₹28 + ₹11/km" */
  summary: string;
};

/**
 * Compact read-only summary for admin quick view (Level 1).
 */
export function PricingBadge(props: {
  lines: PricingBadgeLine[];
  className?: string;
}) {
  if (!props.lines.length) {
    return (
      <p className={cn("text-xs text-slate-500", props.className)}>No pricing configured</p>
    );
  }
  return (
    <ul className={cn("space-y-1 text-sm", props.className)}>
      {props.lines.map((l) => (
        <li key={l.label} className="flex flex-wrap items-baseline gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{l.label}</span>
          <span className="font-semibold tabular-nums text-slate-900">{l.summary}</span>
        </li>
      ))}
    </ul>
  );
}
