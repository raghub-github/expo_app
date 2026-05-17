"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import type { GeoHierarchyLevel } from "@/store/api/geoAdminApi";
import { useRiderRateCardUpsertMutation, useRiderRateCardsByLevelQuery } from "@/store/api/geoAdminApi";
import { RateCardPreviewRow } from "./RateCardPreview";
import { RateCardForm } from "./RateCardForm";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type NonRoot = Exclude<GeoHierarchyLevel, "root">;

const tabs = [
  { id: "food" as const, label: "Food" },
  { id: "parcel" as const, label: "Parcel" },
  { id: "ride" as const, label: "Ride" },
];

export const RateCardModal = React.memo(function RateCardModal(props: {
  row: GeoChildRow | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"food" | "parcel" | "ride">("food");
  const level = props.row?.kind as NonRoot | undefined;
  const refId = props.row?.id;

  const q = useRiderRateCardsByLevelQuery(
    { level: level ?? "state", refId: refId ?? "00000000-0000-0000-0000-000000000000" },
    { skip: !props.row || !level || !refId }
  );

  const [upsert, { isLoading: saving }] = useRiderRateCardUpsertMutation();

  const cards = q.data?.cards ?? [];
  const cardForTab = useMemo(() => cards.find((c) => c.service_type === tab) ?? null, [cards, tab]);

  const effective = props.row?.rider_rate_summaries;
  const effDetail = effective?.[tab];

  if (!props.row || !level) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="rider-rate-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <div>
            <p id="rider-rate-title" className="text-base font-bold text-slate-900">
              Rider rate card
            </p>
            <p className="text-xs text-slate-500">
              {level.replaceAll("_", " ")} · {props.row.name}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Effective (read-only)</p>
            <RateCardPreviewRow summaries={effective ?? null} className="mt-2" />
          </div>

          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex-1 rounded-md py-2 text-xs font-semibold transition",
                  tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {q.isLoading ? (
            <p className="text-sm text-slate-500">Loading stored cards…</p>
          ) : q.isError ? (
            <p className="text-sm text-red-600">Could not load stored cards.</p>
          ) : (
            <RateCardForm
              service={tab}
              storedRow={cardForTab}
              effectiveDefaults={
                effDetail ? { base: effDetail.base_fare, perKm: effDetail.per_km_rate } : null
              }
              submitting={saving}
              onSubmit={async (vals) => {
                const maxRaw = vals.maxDistanceKm.trim();
                const maxDist = maxRaw === "" ? null : Number(maxRaw);
                try {
                  await upsert({
                    level,
                    refId: props.row!.id,
                    service: tab,
                    baseFare: Number(vals.baseFare),
                    perKmRate: Number(vals.perKmRate),
                    minDistanceKm: Number(vals.minDistanceKm || 0),
                    maxDistanceKm: maxDist != null && !Number.isNaN(maxDist) ? maxDist : null,
                    waitingChargePerMin: Number(vals.waitingChargePerMin || 0),
                    surgeMultiplier: Number(vals.surgeMultiplier || 1),
                    priority: Number.parseInt(vals.priority, 10) || 0,
                    isActive: vals.isActive,
                    override: vals.override,
                  }).unwrap();
                  toast.success("Rider rate card saved");
                  void q.refetch();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Save failed");
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
});
