"use client";

import React from "react";
import { SegmentedTriState, type TriValue } from "./SegmentedTriState";
import { Spinner } from "./Loader";
import { cn } from "@/lib/utils";

export type ServiceTriState = TriValue;

export const FilterPanel = React.memo(function FilterPanel(props: {
  states: { id: string; name: string }[];
  stateId: string | null;
  onStateId: (id: string | null) => void;
  food: ServiceTriState;
  parcel: ServiceTriState;
  ride: ServiceTriState;
  onFood: (v: ServiceTriState) => void;
  onParcel: (v: ServiceTriState) => void;
  onRide: (v: ServiceTriState) => void;
  statesLoading?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2",
        props.disabled && "pointer-events-none opacity-60",
        props.className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <label
          htmlFor="geo-state-scope"
          className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
        >
          State
        </label>
        <div className="relative w-[13rem] shrink-0 sm:w-[15rem]">
          <select
            id="geo-state-scope"
            value={props.stateId ?? ""}
            onChange={(e) => props.onStateId(e.target.value || null)}
            disabled={props.statesLoading}
            className="w-full appearance-none rounded-lg border border-slate-200/90 bg-white py-1.5 pl-3 pr-8 text-xs font-medium text-slate-800 shadow-sm transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <option value="">All states</option>
            {props.states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400" aria-hidden>
            ▾
          </span>
        </div>
        {props.statesLoading ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400">
            <Spinner className="text-slate-400" />
            Loading
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
        <SegmentedTriState label="Food" value={props.food} onChange={props.onFood} disabled={props.statesLoading} />
        <SegmentedTriState label="Parcel" value={props.parcel} onChange={props.onParcel} disabled={props.statesLoading} />
        <SegmentedTriState label="Ride" value={props.ride} onChange={props.onRide} disabled={props.statesLoading} />
      </div>
    </div>
  );
});
