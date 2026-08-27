'use client';

import React, { useMemo } from 'react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import {
  elapsedMs,
  formatHandoverDuration,
  resolveHandoverTimelinePhase,
} from '@/lib/orderHandoverTimeline';
import { isPartnerSelfPickupOrder } from '@/lib/partner-delivery-type';

export function ReadyHandoverRunningTimeline({
  order,
  nowMs,
  compact,
  placement = 'inline',
}: {
  order: OrdersFoodRow;
  nowMs: number;
  compact?: boolean;
  /** `panel` = customer column on order detail; `inline` = sidebar cards */
  placement?: 'panel' | 'inline';
}) {
  const isSelfPickup = isPartnerSelfPickupOrder(order);
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
      ? isSelfPickup
        ? 'Hand food to customer in'
        : 'Handover food in'
      : phase === 'waiting_pickup'
        ? isSelfPickup
          ? 'Waiting for customer pickup'
          : 'Waiting for rider pickup'
        : 'Handover complete';

  const waitingHint = isSelfPickup
    ? 'Ask customer for Pickup OTP to complete'
    : 'Share pickup OTP after handoff';

  const progressBar = (heightClass: string, marginClass: string) => (
    <div className={`${heightClass} rounded-full bg-teal-100 overflow-hidden ${marginClass}`}>
      <div
        className="h-full rounded-full bg-teal-500 transition-all duration-500 ease-out"
        style={{ width: `${progressPct}%` }}
      />
    </div>
  );

  if (compact && placement === 'panel') {
    return (
      <div
        className="w-full overflow-x-auto overflow-y-hidden rounded-xl border border-teal-200/80 bg-gradient-to-br from-teal-50 via-white to-emerald-50/80 px-3 py-2.5 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-teal-900 leading-snug">{title}</p>
          </div>
          {phase !== 'complete' ? (
            <span className="shrink-0 rounded-lg bg-white/90 px-2 py-1 font-mono text-xs font-bold text-teal-800 tabular-nums leading-none shadow-sm ring-1 ring-teal-100">
              {formatHandoverDuration(waitingMs)}
            </span>
          ) : (
            <span className="shrink-0 rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">
              Done
            </span>
          )}
        </div>
        {phase === 'waiting_handover' ? (
          <p className="mt-0.5 text-[10px] text-teal-700/90 leading-snug whitespace-nowrap">
            {waitingHint}
          </p>
        ) : null}
        <div className="mt-2.5 h-1.5 rounded-full bg-teal-100/90 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className="w-full rounded-md border border-teal-200/90 bg-teal-50/70 overflow-hidden px-2 py-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <p className="text-[10px] font-semibold text-teal-900 truncate leading-tight">{title}</p>
          {phase !== 'complete' ? (
            <span className="shrink-0 font-mono text-[11px] font-bold text-teal-800 tabular-nums leading-none">
              {formatHandoverDuration(waitingMs)}
            </span>
          ) : (
            <span className="shrink-0 text-[10px] font-semibold text-teal-700 leading-none">Done</span>
          )}
        </div>
        {progressBar('h-1', 'mt-1')}
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
          <span>{isSelfPickup ? 'Ready → Customer' : 'Ready → Handover'}</span>
          <span className="font-semibold text-gray-900 tabular-nums">
            {handedOverAt
              ? formatHandoverDuration(readyToHandoverMs)
              : phase === 'waiting_handover'
                ? formatHandoverDuration(waitingMs)
                : '—'}
          </span>
        </div>
        {!isSelfPickup ? (
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
        ) : null}
      </div>

      {phase === 'waiting_handover' && (
        <p className="mt-2 text-xs text-gray-500">
          {isSelfPickup
            ? 'Hand over the order, then enter the customer Pickup OTP to complete.'
            : 'Confirm order handoff, then share the OTP.'}
        </p>
      )}
    </div>
  );
}
