"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

export type ConditionState = {
  min_distance_km?: number;
  max_distance_km?: number | null;
  time_range?: [string, string];
  day_of_week?: string[];
  order_value_min?: number;
  rain?: boolean | null;
  traffic_level?: string | null;
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function toRecord(state: ConditionState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (state.min_distance_km != null) out.min_distance_km = state.min_distance_km;
  if (state.max_distance_km != null) out.max_distance_km = state.max_distance_km;
  if (state.time_range?.[0] && state.time_range?.[1]) out.time_range = state.time_range;
  if (state.day_of_week?.length) out.day_of_week = state.day_of_week;
  if (state.order_value_min != null) out.order_value_min = state.order_value_min;
  if (state.rain !== null && state.rain !== undefined) out.rain = state.rain;
  if (state.traffic_level) out.traffic_level = state.traffic_level;
  return out;
}

export function parseConditionsJson(raw: unknown): ConditionState {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const tr = o.time_range;
  let time_range: [string, string] | undefined;
  if (Array.isArray(tr) && typeof tr[0] === "string" && typeof tr[1] === "string") {
    time_range = [tr[0], tr[1]];
  }
  const dow = o.day_of_week;
  let day_of_week: string[] | undefined;
  if (Array.isArray(dow)) {
    day_of_week = dow.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  }
  return {
    min_distance_km: typeof o.min_distance_km === "number" ? o.min_distance_km : undefined,
    max_distance_km:
      o.max_distance_km === null || o.max_distance_km === undefined
        ? undefined
        : (o.max_distance_km as number),
    time_range,
    day_of_week,
    order_value_min: typeof o.order_value_min === "number" ? o.order_value_min : undefined,
    rain: typeof o.rain === "boolean" ? o.rain : null,
    traffic_level: typeof o.traffic_level === "string" ? o.traffic_level : null,
  };
}

type Props = {
  value: ConditionState;
  onChange: (next: ConditionState) => void;
  className?: string;
};

/**
 * Maps to `pricing_rule_conditions_match` keys in SQL migration.
 */
export function ConditionBuilder({ value, onChange, className }: Props) {
  const patch = (p: Partial<ConditionState>) => onChange({ ...value, ...p });

  const jsonPreview = useMemo(() => JSON.stringify(toRecord(value), null, 2), [value]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-slate-600">Min distance (km)</span>
          <input
            type="number"
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={value.min_distance_km ?? ""}
            onChange={(e) =>
              patch({ min_distance_km: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label className="block text-xs">
          <span className="text-slate-600">Max distance (km)</span>
          <input
            type="number"
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={value.max_distance_km ?? ""}
            onChange={(e) =>
              patch({
                max_distance_km: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-slate-600">Time window start (HH:MM)</span>
          <input
            type="text"
            placeholder="18:00"
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={value.time_range?.[0] ?? ""}
            onChange={(e) =>
              patch({
                time_range: [e.target.value, value.time_range?.[1] ?? "22:00"],
              })
            }
          />
        </label>
        <label className="block text-xs">
          <span className="text-slate-600">Time window end (HH:MM)</span>
          <input
            type="text"
            placeholder="22:00"
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={value.time_range?.[1] ?? ""}
            onChange={(e) =>
              patch({
                time_range: [value.time_range?.[0] ?? "18:00", e.target.value],
              })
            }
          />
        </label>
      </div>

      <div>
        <p className="text-xs text-slate-600">Days</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {DAYS.map((d) => {
            const on = value.day_of_week?.includes(d) ?? false;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  const cur = new Set(value.day_of_week ?? []);
                  if (cur.has(d)) cur.delete(d);
                  else cur.add(d);
                  patch({ day_of_week: Array.from(cur) });
                }}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize",
                  on
                    ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block text-xs">
        <span className="text-slate-600">Min order value (₹)</span>
        <input
          type="number"
          className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          value={value.order_value_min ?? ""}
          onChange={(e) =>
            patch({ order_value_min: e.target.value === "" ? undefined : Number(e.target.value) })
          }
        />
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="text-slate-600">Rain</span>
          <select
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={value.rain === null || value.rain === undefined ? "" : value.rain ? "true" : "false"}
            onChange={(e) => {
              const v = e.target.value;
              patch({
                rain: v === "" ? null : v === "true",
              });
            }}
          >
            <option value="">Any</option>
            <option value="true">Require rain</option>
            <option value="false">No rain</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-slate-600">Traffic</span>
          <select
            className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={value.traffic_level ?? ""}
            onChange={(e) => patch({ traffic_level: e.target.value || null })}
          >
            <option value="">Any</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
      </div>

      <details className="rounded-md border border-slate-100 bg-slate-50 p-2">
        <summary className="cursor-pointer text-xs font-medium text-slate-600">JSON preview</summary>
        <pre className="mt-2 max-h-32 overflow-auto text-[10px] text-slate-700">{jsonPreview}</pre>
      </details>
    </div>
  );
}

export { toRecord as conditionsToJson };
