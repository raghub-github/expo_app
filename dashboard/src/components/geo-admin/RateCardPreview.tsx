"use client";

import React from "react";
import type { RiderRateEffectiveDetail } from "@/lib/geo/geo-shared";
import { formatRiderRateBadge, riderRateSourceLabel } from "./rateCardFormat";
import { Utensils, Package, CarFront } from "lucide-react";
import { cn } from "@/lib/utils";

const meta = {
  food: { Icon: Utensils, label: "Food" },
  parcel: { Icon: Package, label: "Parcel" },
  ride: { Icon: CarFront, label: "Ride" },
} as const;

export const RateCardPreview = React.memo(function RateCardPreview(props: {
  service: "food" | "parcel" | "ride";
  detail: RiderRateEffectiveDetail | null | undefined;
}) {
  const m = meta[props.service];
  const Icon = m.Icon;
  const d = props.detail;

  return (
    <div className="rounded-lg border border-slate-200/90 bg-white px-2.5 py-2 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
        <Icon className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden />
        {m.label}
      </div>
      <p className="mt-1 font-mono text-xs font-semibold tabular-nums text-slate-900">{formatRiderRateBadge(d ?? null)}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{riderRateSourceLabel(d ?? null)}</p>
    </div>
  );
});

export function RateCardPreviewRow(props: {
  summaries: import("@/lib/geo/geo-shared").RiderRateSummaries | null | undefined;
  className?: string;
}) {
  const s = props.summaries;
  return (
    <div className={cn("grid grid-cols-1 gap-1.5 sm:grid-cols-3", props.className)}>
      <RateCardPreview service="food" detail={s?.food} />
      <RateCardPreview service="parcel" detail={s?.parcel} />
      <RateCardPreview service="ride" detail={s?.ride} />
    </div>
  );
}
