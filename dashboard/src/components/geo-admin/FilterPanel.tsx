"use client";

import React from "react";
import { MapPinned } from "lucide-react";
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
}) {
  return (
    <div
      className={cn(
        "shrink-0 overflow-visible rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm sm:p-4",
        props.disabled && "pointer-events-none opacity-60"
      )}
    >
      <div className="mb-4 flex items-start gap-3 text-slate-800">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-teal-700 ring-1 ring-slate-200/80">
          <MapPinned className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Scope & services</h2>
            {props.statesLoading ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Spinner className="text-slate-400" />
                Loading states
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Tree root follows the selected state; children stay in that state.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,14rem)_repeat(3,minmax(0,1fr))] lg:items-start lg:gap-x-4 lg:gap-y-3">
        <div className="sm:col-span-2 lg:col-span-1">
          <label
            htmlFor="geo-state-scope"
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
          >
            State scope
          </label>
          <div className="relative max-w-full lg:max-w-none">
            <select
              id="geo-state-scope"
              value={props.stateId ?? ""}
              onChange={(e) => props.onStateId(e.target.value || null)}
              disabled={props.statesLoading}
              className="w-full max-w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 sm:max-w-md lg:max-w-none"
            >
              <option value="">All states</option>
              {props.states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
              ▾
            </span>
          </div>
        </div>

        <SegmentedTriState label="Food" value={props.food} onChange={props.onFood} disabled={props.statesLoading} />
        <SegmentedTriState label="Parcel" value={props.parcel} onChange={props.onParcel} disabled={props.statesLoading} />
        <SegmentedTriState label="Ride" value={props.ride} onChange={props.onRide} disabled={props.statesLoading} />
      </div>
    </div>
  );
});
