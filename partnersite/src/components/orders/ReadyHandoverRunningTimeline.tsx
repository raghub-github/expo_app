'use client';

import React, { useMemo } from 'react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import {
  elapsedMs,
  formatHandoverDuration,
  resolveHandoverTimelinePhase,
} from '@/lib/orderHandoverTimeline';

export function ReadyHandoverRunningTimeline({
  order,
  nowMs,
  compact,
}: {
  order: OrdersFoodRow;
  nowMs: number;
  compact?: boolean;
}) {
  const preparedAt = order.prepared_at ?? null;
  const handedOverAt = order.handed_over_to_rider_at ?? null;
  const pickedUpAt = order.rider_picked_up_at ?? null;
  const phase = resolveHandoverTimelinePhase(preparedAt, handedOverAt, pickedUpAt);

  const { readyToHandoverMs, handoverToPickupMs, waitingMs, progressPct } = useMemo(() => {
    if (!preparedAt) {
      return { readyToHandoverMs: 0, handoverToPickupMs: 0, waitingMs: 0, progressPct: 0 };
    }
    if (phase === 'waiting_handover') {
      const waiting = elapsedMs(preparedAt, nowMs);
      return {
        readyToHandoverMs: 0,
        handoverToPickupMs: 0,
        waitingMs: waiting,
        progressPct: Math.min(95, 12 + (waiting / 600_000) * 80),
      };
    }
    if (phase === 'waiting_pickup' && handedOverAt) {
      const r2h = elapsedMs(preparedAt, new Date(handedOverAt).getTime());
      const waiting = elapsedMs(handedOverAt, nowMs);
      return {
        readyToHandoverMs: r2h,
        handoverToPickupMs: 0,
        waitingMs: waiting,
        progressPct: Math.min(95, 50 + (waiting / 600_000) * 45),
      };
    }
    if (phase === 'complete' && handedOverAt && pickedUpAt) {
      const r2h = elapsedMs(preparedAt, new Date(handedOverAt).getTime());
      const h2p = elapsedMs(handedOverAt, new Date(pickedUpAt).getTime());
      return {
        readyToHandoverMs: r2h,
        handoverToPickupMs: h2p,
        waitingMs: 0,
        progressPct: 100,
      };
    }
    return { readyToHandoverMs: 0, handoverToPickupMs: 0, waitingMs: 0, progressPct: 0 };
  }, [preparedAt, handedOverAt, pickedUpAt, phase, nowMs]);

  const title =
    phase === 'waiting_handover'
      ? 'Handover food in'
      : phase === 'waiting_pickup'
        ? 'Waiting for rider pickup'
        : 'Handover complete';

  const progressBar = (heightClass: string, marginClass: string) => (
    <div className={`${heightClass} rounded-full bg-teal-100 overflow-hidden ${marginClass}`}>
      <div
        className="h-full rounded-full bg-teal-500 transition-all duration-500 ease-out"
        style={{ width: `${progressPct}%` }}
      />
    </div>
  );

  if (compact) {
    return (
      <div
        className="w-full rounded-lg border border-teal-200 bg-teal-50/80 overflow-hidden p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
          <p className="text-[11px] font-semibold text-teal-900 truncate">{title}</p>
          {phase !== 'complete' ? (
            <span className="shrink-0 font-mono text-xs font-bold text-teal-800 tabular-nums">
              {formatHandoverDuration(waitingMs)}
            </span>
          ) : (
            <span className="shrink-0 text-[10px] font-semibold text-teal-700">Done</span>
          )}
        </div>
        {progressBar('h-1.5', '')}
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white overflow-hidden p-3.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-teal-900">{title}</p>
        {phase !== 'complete' && (
          <span className="font-mono text-base font-bold text-teal-800 tabular-nums">
            {formatHandoverDuration(waitingMs)}
          </span>
        )}
      </div>

      {progressBar('h-2', 'mb-3')}

      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-2 text-gray-600">
          <span>Ready → Handover</span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {handedOverAt
              ? formatHandoverDuration(readyToHandoverMs)
              : phase === 'waiting_handover'
                ? formatHandoverDuration(waitingMs)
                : '—'}
          </span>
        </div>
        <div className="flex justify-between gap-2 text-gray-600">
          <span>Handover → Pickup</span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {pickedUpAt
              ? formatHandoverDuration(handoverToPickupMs)
              : phase === 'waiting_pickup'
                ? formatHandoverDuration(waitingMs)
                : handedOverAt
                  ? 'Waiting…'
                  : '—'}
          </span>
        </div>
      </div>

      {phase === 'waiting_handover' && (
        <p className="mt-2 text-xs text-gray-500">
           Confirm order handoff, then share the OTP..
        </p>
      )}
    </div>
  );
}
