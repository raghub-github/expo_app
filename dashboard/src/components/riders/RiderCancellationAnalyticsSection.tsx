"use client";

import { useMemo, useState } from "react";
import { RefreshCw, ChevronDown, AlertTriangle } from "lucide-react";
import { useRiderCancellationAnalyticsQuery } from "@/hooks/queries/useRiderCancellationAnalyticsQuery";
import type {
  ServiceCancellationAnalytics,
  FaultBreakdown,
} from "@/lib/riders/rider-cancellation-analytics";

const SERVICE_LABELS: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person Ride",
};

const FAULT_LABELS: Record<keyof FaultBreakdown, string> = {
  RIDER_FAULT: "Rider",
  CUSTOMER_FAULT: "Customer",
  MERCHANT_FAULT: "Merchant",
  COMPANY_FAULT: "Company",
  SYSTEM_FAULT: "System",
  UNKNOWN: "Unknown",
};

/** Rate | null (accepted = 0). N/A is the one consistent zero-denominator display (spec §14). */
function pct(value: number | null): string {
  return value == null ? "N/A" : `${value.toFixed(2)}%`;
}

function Metric({
  label,
  value,
  tone = "default",
  strong = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "good" | "muted";
  strong?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "good"
        ? "text-emerald-600"
        : tone === "muted"
          ? "text-gray-500"
          : "text-gray-900";
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold tabular-nums ${toneClass} ${strong ? "text-sm" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function FaultRows({ byFault }: { byFault: FaultBreakdown }) {
  const keys = Object.keys(FAULT_LABELS) as (keyof FaultBreakdown)[];
  return (
    <div className="space-y-1">
      {keys.map((k) => (
        <div key={k} className="flex items-center justify-between text-[11px]">
          <span className={k === "RIDER_FAULT" ? "font-medium text-gray-800" : "text-gray-500"}>
            {FAULT_LABELS[k]}
          </span>
          <span
            className={`tabular-nums ${k === "RIDER_FAULT" ? "font-semibold text-red-600" : "text-gray-700"}`}
          >
            {byFault[k]}
          </span>
        </div>
      ))}
    </div>
  );
}

function ServiceCard({ svc }: { svc: ServiceCancellationAnalytics }) {
  const [expanded, setExpanded] = useState(false);
  const label = SERVICE_LABELS[svc.service] ?? svc.service.replace(/_/g, " ");
  return (
    <div className="rounded-lg border border-rose-200 bg-gradient-to-br from-rose-50 to-orange-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold capitalize text-gray-800">{label}</p>
        <span
          className={`rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
            svc.cancellationRate == null
              ? "bg-gray-100 text-gray-500"
              : svc.cancellationRate >= 25
                ? "bg-red-100 text-red-700"
                : svc.cancellationRate >= 10
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
          }`}
          title="Cancellation Rate"
        >
          {pct(svc.cancellationRate)}
        </span>
      </div>

      <div className="space-y-2">
        <Metric label="Accepted" value={String(svc.accepted)} />
        <Metric label="Cancelled" value={String(svc.cancelled)} tone="danger" />
        <Metric label="Cancellation Rate" value={pct(svc.cancellationRate)} tone="danger" strong />

        <div className="my-2 border-t border-rose-200/70" />

        <Metric label="Pre-Pickup" value={String(svc.prePickup)} />
        <Metric label="Post-Pickup" value={String(svc.postPickup)} />

        <div className="my-2 border-t border-rose-200/70" />

        <Metric label="Rider Fault" value={String(svc.riderFault)} tone="danger" />
        <Metric label="Rider Fault Rate" value={pct(svc.riderFaultRate)} tone="danger" strong />
        <Metric label="Rider Fault Share" value={pct(svc.riderFaultShare)} tone="muted" />
        <Metric label="Rider Fault · Pre-Pickup" value={String(svc.riderFaultPrePickup)} />
        <Metric label="Rider Fault · Post-Pickup" value={String(svc.riderFaultPostPickup)} />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-md border border-rose-200 bg-white/60 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-white"
      >
        Full breakdown
        <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-md border border-rose-200/70 bg-white/70 p-2">
            <p className="mb-1.5 text-[11px] font-bold text-gray-700">
              Pre-Pickup · {svc.breakdown.prePickup.total}
            </p>
            <FaultRows byFault={svc.breakdown.prePickup.byFault} />
          </div>
          <div className="rounded-md border border-rose-200/70 bg-white/70 p-2">
            <p className="mb-1.5 text-[11px] font-bold text-gray-700">
              Post-Pickup · {svc.breakdown.postPickup.total}
            </p>
            <FaultRows byFault={svc.breakdown.postPickup.byFault} />
          </div>
        </div>
      )}
    </div>
  );
}

export function RiderCancellationAnalyticsSection({
  riderId,
  from,
  to,
}: {
  riderId: number | null;
  from?: string;
  to?: string;
}) {
  const params = useMemo(
    () => ({ from: from || undefined, to: to || undefined }),
    [from, to]
  );
  const { data, isLoading, isError, error, refetch, isFetching } =
    useRiderCancellationAnalyticsQuery(riderId, params);

  const serviceOrder = ["food", "parcel", "person_ride"];
  const services = data
    ? serviceOrder
        .map((k) => data.services[k])
        .filter((s): s is ServiceCancellationAnalytics => Boolean(s))
    : [];

  const overall = data?.overall;

  return (
    <div className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm ring-1 ring-gray-900/5 sm:p-5 lg:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-md font-semibold text-gray-800">Cancellation Analytics</h3>
          <p className="text-[11px] text-gray-500">
            Cancellations after the rider accepted, ÷ orders the rider accepted. Rider fault is
            only counted when the cancellation reason is rider-attributed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-60"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          Failed to load cancellation analytics{error instanceof Error ? `: ${error.message}` : ""}.
        </div>
      ) : !overall ? (
        <p className="text-xs text-gray-500">No cancellation data available.</p>
      ) : (
        <>
          {/* Overall headline */}
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                Overall Cancellation Rate
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700">
                {pct(overall.cancellationRate)}
              </p>
              <p className="text-[11px] text-gray-600">
                {overall.cancelled} cancelled / {overall.accepted} accepted
              </p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                Overall Rider-Fault Rate
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-red-700">
                {pct(overall.riderFaultRate)}
              </p>
              <p className="text-[11px] text-gray-600">
                {overall.riderFault} rider-fault / {overall.accepted} accepted
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                Rider-Fault Share
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gray-800">
                {pct(overall.riderFaultShare)}
              </p>
              <p className="text-[11px] text-gray-600">
                {overall.riderFault} rider-fault / {overall.cancelled} cancelled
              </p>
            </div>
          </div>

          {/* Service cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {services.map((svc) => (
              <ServiceCard key={svc.service} svc={svc} />
            ))}
          </div>

          {data?.dataQuality?.reconciliationErrors?.length ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Reconciliation warnings: {data.dataQuality.reconciliationErrors.join("; ")}</span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
