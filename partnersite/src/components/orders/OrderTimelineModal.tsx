'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';

const TIMELINE_STEPS = [
  { key: 'placed', label: 'Placed', at: (o: OrdersFoodRow) => o.created_at },
  { key: 'accepted', label: 'Accepted', at: (o: OrdersFoodRow) => o.accepted_at },
  { key: 'preparing', label: 'Preparing', at: (o: OrdersFoodRow) => o.preparing_at ?? null },
  { key: 'ready', label: 'Ready for pickup', at: (o: OrdersFoodRow) => o.prepared_at },
  { key: 'dispatch', label: 'Out for delivery', at: (o: OrdersFoodRow) => o.dispatched_at },
  { key: 'delivered', label: 'Delivered', at: (o: OrdersFoodRow) => o.delivered_at },
] as const;

function formatTs(s: string | null | undefined) {
  if (!s) return null;
  return new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatPlacedAgo(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Placed just now';
  if (mins < 60) return `Placed ${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  return `Placed ${hrs} hour${hrs === 1 ? '' : 's'} ago`;
}

function stepState(order: OrdersFoodRow, step: (typeof TIMELINE_STEPS)[number], status: string) {
  const ts = step.at(order);
  if (ts) return 'done' as const;
  const st = (status || 'CREATED').toUpperCase();
  const map: Record<string, string> = {
    CREATED: 'placed',
    NEW: 'placed',
    ACCEPTED: 'accepted',
    PREPARING: 'preparing',
    READY_FOR_PICKUP: 'ready',
    OUT_FOR_DELIVERY: 'dispatch',
    DELIVERED: 'delivered',
  };
  const current = map[st] ?? 'placed';
  if (step.key === current) return 'active' as const;
  return 'pending' as const;
}

export type OrderTimelineModalProps = {
  open: boolean;
  onClose: () => void;
  order: OrdersFoodRow | null;
  orderIdLabel?: string;
};

export function OrderTimelineModal({ open, onClose, order, orderIdLabel }: OrderTimelineModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !order || typeof document === 'undefined') return null;

  const status = order.order_status || 'CREATED';
  const idText =
    orderIdLabel ??
    (order.formatted_order_id ? `ID: ${order.formatted_order_id}` : `ID: ${order.order_id}`);

  return createPortal(
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-timeline-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 id="order-timeline-title" className="text-lg font-bold text-gray-900">
            Order Timeline
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center justify-between gap-4 mb-8 text-sm">
            <span className="font-semibold text-gray-900">{idText}</span>
            <span className="text-gray-500">{formatPlacedAgo(order.created_at)}</span>
          </div>

          <div className="flex items-start justify-between gap-1 overflow-x-auto hide-scrollbar pb-2">
            {TIMELINE_STEPS.map((step, i) => {
              const state = stepState(order, step, status);
              const ts = step.at(order);
              const prevDone =
                i > 0 && TIMELINE_STEPS[i - 1].at(order);
              return (
                <React.Fragment key={step.key}>
                  {i > 0 && (
                    <div
                      className={`flex-1 min-w-[12px] h-0.5 mt-4 ${
                        prevDone ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    />
                  )}
                  <div className="flex flex-col items-center min-w-[72px] max-w-[100px] shrink-0">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
                        state === 'done'
                          ? 'bg-green-500 border-green-500 text-white'
                          : state === 'active'
                            ? 'bg-white border-green-500 text-green-600'
                            : 'bg-white border-gray-200 text-gray-400'
                      }`}
                    >
                      {state === 'done' ? (
                        <Check className="w-4 h-4" strokeWidth={3} />
                      ) : (
                        <span className="text-xs font-bold">{i + 1}</span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] font-medium text-gray-800 text-center leading-tight">
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-500 text-center min-h-[14px]">
                      {ts ? formatTs(ts) : state === 'active' ? 'In progress' : '—'}
                    </p>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

