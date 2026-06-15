"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Infinity, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  RIDE_VEHICLE_LIMIT_LABELS,
  type RideVehiclePricingType,
} from "@/lib/geo/ride-state-config-shared";

const inputCls =
  "w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-mono shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";

function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function InlineVehicleRideLimitField(props: {
  stateId: string;
  vehicleType: RideVehiclePricingType;
  stateLabel?: string;
}) {
  const [km, setKm] = useState("");
  const [isUnlimited, setIsUnlimited] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadForVehicle = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/super-admin/geo/ride-vehicle-limits?stateId=${props.stateId}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const row = (json.limits ?? []).find(
        (l: { vehicleType: string; isEnabled?: boolean }) => l.vehicleType === props.vehicleType
      );
      const hasCap = row && row.isEnabled !== false && row.maxDistanceKm > 0;
      setKm(hasCap ? String(row.maxDistanceKm) : "");
      setIsUnlimited(!hasCap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [props.stateId, props.vehicleType]);

  useEffect(() => {
    void loadForVehicle();
  }, [loadForVehicle]);

  const save = async () => {
    const maxDistanceKm = num(km);
    const unlimited = maxDistanceKm == null || maxDistanceKm <= 0;

    if (!unlimited && maxDistanceKm > 10_000) {
      toast.error("Max distance seems too large (max 10,000 km)");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/geo/ride-vehicle-limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stateId: props.stateId,
          limits: [
            unlimited
              ? { vehicleType: props.vehicleType, unlimited: true }
              : {
                  vehicleType: props.vehicleType,
                  maxDistanceKm,
                  isEnabled: true,
                },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setIsUnlimited(unlimited);
      if (unlimited) setKm("");
      toast.success(
        unlimited
          ? `${RIDE_VEHICLE_LIMIT_LABELS[props.vehicleType]} — unlimited (all India)`
          : `${RIDE_VEHICLE_LIMIT_LABELS[props.vehicleType]} — max ${maxDistanceKm} km saved`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="block text-xs font-semibold text-slate-700">
      <span>Max distance km</span>
      <p className="mt-0.5 text-[10px] font-normal text-slate-500">
        Blank = unlimited · Pickup state limit only
        {props.stateLabel ? ` (${props.stateLabel})` : ""}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input
          className={inputCls}
          placeholder="Unlimited"
          disabled={loading || saving}
          value={km}
          onChange={(e) => {
            setKm(e.target.value);
            setIsUnlimited(e.target.value.trim() === "");
          }}
        />
        {isUnlimited && !loading ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800">
            <Infinity className="h-3 w-3" />
            All India
          </span>
        ) : null}
        <button
          type="button"
          disabled={loading || saving}
          onClick={() => void save()}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
          title="Save limit for selected vehicle in this state"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save
        </button>
      </div>
    </div>
  );
}
