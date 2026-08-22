"use client";

import { useEffect, useMemo, useState } from "react";
import { riderDeliveryMilestoneLabel } from "@/lib/riders/rider-order-status-display";

export type RiderTimelineData = {
  assigned_at?: string | null;
  accepted_at?: string | null;
  reached_merchant_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  reached_merchant_skipped?: boolean;
  picked_up_actor_type?: string | null;
  picked_up_actor_label?: string | null;
  events?: Array<{
    event_type: string;
    occurred_at: string;
    merchant_distance_km?: number | null;
    customer_distance_km?: number | null;
  }>;
};

interface RiderTimelineProps {
  orderId: number;
  riderId?: number | null;
  orderType?: string | null;
  /** When provided with order fetch, timeline renders instantly (no loading state). */
  initialData?: RiderTimelineData | null;
  className?: string;
}

type TimelineStep = {
  key: string;
  label: string;
  distEventType: string;
  at: (data: RiderTimelineData) => string | null | undefined;
};

function buildTimelineSteps(data: RiderTimelineData | null, orderType?: string | null): TimelineStep[] {
  const reachedSkipped = Boolean(data?.reached_merchant_skipped);
  const steps: TimelineStep[] = [
    {
      key: "assigned",
      label: "Assigned",
      distEventType: "assigned",
      at: (d) => d.assigned_at,
    },
  ];

  if (!reachedSkipped) {
    steps.push({
      key: "reached_merchant",
      label: "Reached Mx",
      distEventType: "reached_merchant",
      at: (d) => d.reached_merchant_at,
    });
  }

  steps.push({
    key: "picked_up",
    label: "Picked Up",
    distEventType: "picked_up",
    at: (d) => d.picked_up_at,
  });

  steps.push({
    key: "delivered",
    label: riderDeliveryMilestoneLabel(orderType),
    distEventType: "delivered",
    at: (d) => d.delivered_at,
  });

  return steps;
}

function formatDistKm(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  if (n < 0) return null;
  return `${n.toFixed(2)}km`;
}

function eventDistances(
  data: RiderTimelineData | null,
  eventType: string
): { mx: string | null; cx: string | null } {
  const hit = data?.events?.find((e) => e.event_type === eventType);
  return {
    mx: formatDistKm(hit?.merchant_distance_km),
    cx: formatDistKm(hit?.customer_distance_km),
  };
}

const ROW_H = "h-[14px]";
const LEADER_W = 22;
const LEADER_H = 28;
const LABEL_Y = 7;
const TIME_Y = 21;
const JOIN_X = 14;

function DistanceLeaderLines({ hasMx, hasCx }: { hasMx: boolean; hasCx: boolean }) {
  const both = hasMx && hasCx;
  const endX = LEADER_W;

  return (
    <svg
      width={LEADER_W}
      height={LEADER_H}
      viewBox={`0 0 ${LEADER_W} ${LEADER_H}`}
      className="shrink-0 text-emerald-500/90"
      aria-hidden
    >
      {hasMx ? (
        <line
          x1={0}
          y1={LABEL_Y}
          x2={endX}
          y2={LABEL_Y}
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
        />
      ) : null}
      {hasCx ? (
        <line
          x1={0}
          y1={TIME_Y}
          x2={both ? JOIN_X : endX}
          y2={TIME_Y}
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
        />
      ) : null}
      {both ? (
        <line
          x1={JOIN_X}
          y1={TIME_Y}
          x2={JOIN_X}
          y2={LABEL_Y}
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

function TimelineDistances({
  dist,
  labelColor,
  timeColor,
  label,
  timeText,
}: {
  dist: { mx: string | null; cx: string | null };
  labelColor: string;
  timeColor: string;
  label: string;
  timeText: string;
}) {
  const hasMx = Boolean(dist.mx);
  const hasCx = Boolean(dist.cx);

  return (
    <div className="flex w-full min-w-0 max-w-full items-stretch gap-1 pr-0.5">
      <div className="min-w-0 shrink">
        <p className={`${ROW_H} whitespace-nowrap text-[11px] font-semibold leading-[14px] ${labelColor}`}>
          {label}
        </p>
        <p className={`${ROW_H} whitespace-nowrap text-[10px] font-medium leading-[14px] ${timeColor}`}>
          {timeText}
        </p>
      </div>

      <DistanceLeaderLines hasMx={hasMx} hasCx={hasCx} />

      <div className="ml-0.5 w-[4.1rem] shrink-0 rounded border border-emerald-200 bg-emerald-50/95 px-1 py-0.5">
        {hasMx ? (
          <p
            className={`${ROW_H} whitespace-nowrap text-right text-[8px] font-semibold leading-[14px] text-emerald-700 tabular-nums`}
          >
            MX – {dist.mx}
          </p>
        ) : (
          <div className={ROW_H} aria-hidden />
        )}
        {hasCx ? (
          <p
            className={`${ROW_H} whitespace-nowrap text-right text-[8px] font-semibold leading-[14px] text-emerald-700 tabular-nums`}
          >
            CX – {dist.cx}
          </p>
        ) : (
          <div className={ROW_H} aria-hidden />
        )}
      </div>
    </div>
  );
}

export default function RiderTimeline({
  orderId,
  riderId,
  orderType,
  initialData,
  className = "",
}: RiderTimelineProps) {
  const [data, setData] = useState<RiderTimelineData | null>(initialData ?? null);
  const [loading, setLoading] = useState(initialData === undefined);

  useEffect(() => {
    if (initialData !== undefined) {
      setData(initialData);
      setLoading(false);
      return;
    }

    if (!riderId || !orderId) {
      setData(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/orders/${orderId}/rider-timeline?rider_id=${riderId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: RiderTimelineData | null) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId, riderId, initialData]);

  const steps = useMemo(() => buildTimelineSteps(data, orderType), [data, orderType]);
  const reachedSkipped = Boolean(data?.reached_merchant_skipped);

  const currentStepIdx = useMemo(() => {
    if (!riderId || !data) return -1;
    let idx = 0;
    steps.forEach((step, i) => {
      if (step.at(data)) idx = i;
    });
    return idx;
  }, [data, riderId, steps]);

  const formatTimeShort = (s: string | null | undefined) => {
    if (!s) return "";
    const date = new Date(s);
    if (isNaN(date.getTime())) return "";
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  if (riderId && loading) {
    return (
      <div className={`space-y-2 ${className}`} aria-busy="true" aria-label="Loading delivery progress">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  const hasRider = riderId != null && Number.isFinite(Number(riderId)) && Number(riderId) > 0;

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col ${className}`}
      role="list"
      aria-label="Rider delivery progress"
    >
      <ol className="flex flex-col py-0.5">
        {steps.map((step, index) => {
          const ts = hasRider && data ? step.at(data) : null;
          const done = hasRider && currentStepIdx >= index;
          const isActive = hasRider && index === currentStepIdx && !ts;
          const isComplete = Boolean(ts);
          const dist = hasRider ? eventDistances(data, step.distEventType) : { mx: null, cx: null };
          const isLast = index === steps.length - 1;
          const segmentDone = hasRider && currentStepIdx > index;
          const dotColor = done || isActive ? "bg-emerald-500 ring-emerald-100" : "bg-slate-300 ring-slate-100";
          const labelColor = done || isActive ? "text-emerald-800" : "text-slate-500";
          const timeColor = isComplete ? "text-emerald-600" : "text-slate-400";
          const timeText = ts
            ? formatTimeShort(ts)
            : !hasRider
              ? "Pending"
              : done || isActive
                ? "—"
                : "Pending";

          return (
            <li key={step.key} className="flex gap-2" role="listitem">
              <div className="flex w-3.5 shrink-0 flex-col items-center">
                <div
                  className={`relative z-10 mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white ring-2 ${dotColor}`}
                >
                  <span className="absolute inset-[3px] rounded-full bg-white" />
                </div>
                {!isLast ? (
                  <div
                    className={`mt-0.5 w-[2px] flex-1 min-h-[28px] rounded-full ${
                      segmentDone ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  />
                ) : null}
              </div>

              <div className={`min-w-0 flex-1 max-w-full ${isLast ? "pb-0" : "pb-2.5"}`}>
                {dist.mx || dist.cx ? (
                  <TimelineDistances
                    dist={dist}
                    labelColor={labelColor}
                    timeColor={timeColor}
                    label={step.label}
                    timeText={timeText}
                  />
                ) : (
                  <>
                    <p className={`text-[11px] font-semibold leading-tight ${labelColor}`}>{step.label}</p>
                    <p className={`mt-0.5 text-[10px] font-medium leading-tight ${timeColor}`}>
                      {timeText}
                    </p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
