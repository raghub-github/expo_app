"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type TriValue = boolean | null;

export const SegmentedTriState = React.memo(function SegmentedTriState(props: {
  label: string;
  value: TriValue;
  onChange: (v: TriValue) => void;
  disabled?: boolean;
}) {
  const seg = (v: TriValue, text: string) => (
    <button
      type="button"
      disabled={props.disabled}
      onClick={() => props.onChange(v)}
      className={cn(
        "relative z-10 min-w-0 flex-1 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold transition-all duration-150",
        props.value === v
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-teal-200"
          : "text-slate-500 hover:text-slate-800"
      )}
    >
      {text}
    </button>
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {props.label}
      </span>
      <div
        className={cn(
          "flex w-[9.5rem] shrink-0 rounded-lg bg-white/80 p-0.5 ring-1 ring-slate-200/90",
          props.disabled && "pointer-events-none opacity-50"
        )}
        role="group"
        aria-label={props.label}
      >
        {seg(null, "Any")}
        {seg(true, "On")}
        {seg(false, "Off")}
      </div>
    </div>
  );
});
