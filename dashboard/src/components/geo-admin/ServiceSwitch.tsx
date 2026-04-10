"use client";

import React from "react";
import { CarFront, Loader2, Package, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";

const icons = {
  food: Utensils,
  parcel: Package,
  ride: CarFront,
} as const;

const labels = { food: "Food", parcel: "Parcel", ride: "Ride" } as const;

export const ServiceSwitch = React.memo(function ServiceSwitch(props: {
  service: keyof typeof icons;
  on: boolean;
  inherited: boolean;
  pending?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const Icon = icons[props.service];
  const title = props.inherited
    ? `${labels[props.service]}: effective ${props.on ? "on" : "off"} (inherited). Click to override.`
    : `${labels[props.service]}: ${props.on ? "on" : "off"}`;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={props.on}
        aria-busy={props.pending}
        title={title}
        disabled={props.disabled || props.pending}
        onClick={props.onToggle}
        className={cn(
          "group relative flex h-5 w-[2.125rem] shrink-0 items-center rounded-full border transition-all duration-200 ease-out",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500",
          props.on
            ? "border-emerald-400/50 bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_1px_6px_rgba(20,184,166,0.28)]"
            : "border-slate-200/90 bg-slate-200/90",
          props.inherited && "ring-1 ring-dashed ring-amber-400/45 ring-offset-1 ring-offset-white",
          (props.disabled || props.pending) && "opacity-60 cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "absolute top-px left-px flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
            props.on && "translate-x-[0.72rem]"
          )}
        >
          {props.pending ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-teal-600" aria-hidden />
          ) : (
            <Icon className={cn("h-2.5 w-2.5", props.on ? "text-emerald-600" : "text-slate-400")} aria-hidden />
          )}
        </span>
      </button>
      <span className="whitespace-nowrap text-[7px] font-bold uppercase tracking-wide text-slate-500">
        {labels[props.service]}
      </span>
    </div>
  );
});
