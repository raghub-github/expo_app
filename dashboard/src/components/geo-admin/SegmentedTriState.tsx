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
        "relative z-10 min-w-0 flex-1 whitespace-nowrap rounded-[0.375rem] px-2 py-1.5 text-[11px] font-semibold transition-all duration-150 sm:text-xs",
        props.value === v
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
          : "text-slate-500 hover:text-slate-800"
      )}
    >
      {text}
    </button>
  );

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-1.5">
      <span className="w-full text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {props.label}
      </span>
      <div
        className={cn(
          "mx-auto flex w-full max-w-[11.5rem] rounded-lg bg-slate-100 p-0.5 ring-1 ring-slate-200/90 lg:mx-0 lg:max-w-none",
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
