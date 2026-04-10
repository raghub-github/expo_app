"use client";

import React from "react";
import type { RiderRateEffectiveDetail } from "@/lib/geo/geo-shared";
import { formatRiderRateBadge } from "./rateCardFormat";
import { cn } from "@/lib/utils";

const chip: Record<string, string> = {
  food: "border-orange-200/80 bg-orange-50/90 text-orange-900",
  parcel: "border-sky-200/80 bg-sky-50/90 text-sky-900",
  ride: "border-violet-200/80 bg-violet-50/90 text-violet-900",
};

export const RateCardBadge = React.memo(function RateCardBadge(props: {
  service: "food" | "parcel" | "ride";
  detail: RiderRateEffectiveDetail | null | undefined;
  className?: string;
}) {
  const label = props.service.toUpperCase();
  const text = formatRiderRateBadge(props.detail ?? null);
  const title = props.detail ? `${label}: ${text}` : `${label}: no rider rate`;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-[9.5rem] truncate rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-semibold tabular-nums leading-tight",
        chip[props.service] ?? "border-slate-200 bg-slate-50 text-slate-700",
        props.className
      )}
    >
      <span className="mr-1 shrink-0 opacity-80">{label.slice(0, 1)}</span>
      {text}
    </span>
  );
});
