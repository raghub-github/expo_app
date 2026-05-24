'use client';

import React from 'react';
import {
  Check,
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  User,
  UtensilsCrossed,
  X,
  XCircle,
} from 'lucide-react';
import type { OrdersFoodRow } from '@/lib/types/food-orders';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';
import { MerchantOrderItemsList } from '@/components/orders/MerchantOrderItemsList';
import { getUtensilsCustomerLabel } from '@/lib/orderUtensilsLabel';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';

export const INCOMING_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Created',
  NEW: 'Created',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready',
  OUT_FOR_DELIVERY: 'Dispatch',
  DELIVERED: 'Delivered',
  RTO: 'RTO',
  CANCELLED: 'Cancelled',
};

export function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString();
}

export function formatVegNonVeg(v: string | null): string {
  if (!v || v === 'na') return '—';
  if (v === 'veg') return '🥗 Veg';
  if (v === 'non_veg') return '🍗 Non-Veg';
  if (v === 'mixed') return '🥗🍗 Mixed';
  return v;
}

export function FormattedOrderId({
  formattedOrderId,
  fallbackOrderId,
  size = 'base',
}: {
  formattedOrderId?: string | null;
  fallbackOrderId: number;
  size?: 'sm' | 'base' | 'lg';
}) {
  const sizeClasses = {
    sm: { base: 'text-xs', sizes: ['0.625rem', '0.7rem', '0.775rem', '0.85rem'] },
    base: { base: 'text-base', sizes: ['0.875rem', '1rem', '1.125rem', '1.25rem'] },
    lg: { base: 'text-lg', sizes: ['1rem', '1.125rem', '1.25rem', '1.375rem'] },
  };
  const classes = sizeClasses[size];

  if (formattedOrderId) {
    const prefix = formattedOrderId.slice(0, -4);
    const lastFour = formattedOrderId.slice(-4);
    return (
      <span className="inline-flex items-baseline gap-0.5">
        <span className={`font-bold text-gray-900 ${classes.base}`}>{prefix}</span>
        {lastFour.split('').map((digit, idx) => (
          <span key={idx} className="font-bold text-orange-600" style={{ fontSize: classes.sizes[idx] }}>
            {digit}
          </span>
        ))}
      </span>
    );
  }
  return <span className={`font-bold text-gray-900 ${classes.base}`}>#{fallbackOrderId}</span>;
}

const ORDER_STEPS = [
  { key: 'placed', label: 'Placed', status: 'CREATED', at: (o: OrdersFoodRow) => o.created_at },
  { key: 'accepted', label: 'Accepted', status: 'ACCEPTED', at: (o: OrdersFoodRow) => o.accepted_at },
  { key: 'preparing', label: 'Preparing', status: 'PREPARING', at: () => null },
  { key: 'ready', label: 'Ready', status: 'READY_FOR_PICKUP', at: (o: OrdersFoodRow) => o.prepared_at },
  { key: 'dispatch', label: 'Dispatch', status: 'OUT_FOR_DELIVERY', at: (o: OrdersFoodRow) => o.dispatched_at },
  { key: 'delivered', label: 'Delivered', status: 'DELIVERED', at: (o: OrdersFoodRow) => o.delivered_at },
] as const;

function orderStepIndex(status: string | undefined): number {
  const order = ['CREATED', 'NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED'];
  const i = order.indexOf(status || 'CREATED');
  return i >= 0 ? i : 0;
}

function lastCompletedStepIndex(order: OrdersFoodRow): number {
  let last = -1;
  ORDER_STEPS.forEach((step, i) => {
    if (step.at(order)) last = i;
  });
  return last >= 0 ? last : 0;
}

export function OrderStatusTimeline({ order, compact }: { order: OrdersFoodRow; compact?: boolean }) {
  const status = order.order_status || 'CREATED';
  const isTerminal = status === 'CANCELLED' || status === 'RTO';
  const lastCompletedIdx = lastCompletedStepIndex(order);
  const currentIdx = isTerminal ? lastCompletedIdx : orderStepIndex(status);
  const formatTs = (s: string | null | undefined) =>
    s ? new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
  const stepsToShow = isTerminal ? ORDER_STEPS.slice(0, lastCompletedIdx + 1) : ORDER_STEPS;

  if (compact) {
    const terminalLabel = status === 'CANCELLED' ? 'Cancelled' : 'RTO';
    return (
      <div className="flex-1 w-full min-w-0 flex flex-col">
        <div className="flex items-center w-full">
          <div className="shrink-0 w-16 mr-3 flex items-center justify-center min-h-[20px] mt-1.5" />
          <div className="flex-1 flex min-w-0">
            {stepsToShow.map((step) => (
              <div key={step.key} className="flex-1 flex flex-col items-center min-w-0 px-0.5">
                <span className="text-[9px] font-medium text-gray-600 text-center leading-tight truncate w-full" title={step.label}>
                  {step.label}
                </span>
              </div>
            ))}
            {isTerminal && (
              <div className="flex-1 flex flex-col items-center min-w-0 px-0.5">
                <span className="text-[9px] font-medium text-gray-600 text-center leading-tight">{terminalLabel}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center w-full mt-1">
          <div className="shrink-0 w-16 mr-3" aria-hidden />
          <div className="flex-1 flex items-center min-w-0">
            {stepsToShow.map((step, i) => {
              const stepIdx = orderStepIndex(step.status);
              const done = currentIdx >= stepIdx || status === step.status;
              const prevDone = i > 0 && currentIdx >= orderStepIndex(stepsToShow[i - 1].status);
              return (
                <div key={step.key} className="flex-1 flex items-center min-w-0">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {done ? <Check size={10} strokeWidth={3} /> : <span className="text-[8px] font-bold">{i + 1}</span>}
                  </div>
                  {i < stepsToShow.length - 1 ? (
                    <div className={`flex-1 h-0.5 min-w-[6px] ${prevDone ? 'bg-green-400' : 'bg-gray-200'}`} />
                  ) : null}
                </div>
              );
            })}
            {isTerminal && (
              <>
                <div className="flex-1 h-0.5 min-w-[6px] bg-gray-300" />
                <div className="flex-1 flex items-center min-w-0">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      status === 'CANCELLED' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                    }`}
                  >
                    <XCircle size={12} strokeWidth={2.5} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-start w-full mt-1">
          <div className="shrink-0 w-16 mr-3" aria-hidden />
          <div className="flex-1 flex min-w-0">
            {stepsToShow.map((step) => {
              const ts = step.at(order);
              return (
                <div key={step.key} className="flex-1 flex flex-col items-center min-w-0 px-0.5">
                  {ts ? (
                    <span className="text-[8px] text-gray-500 text-center">{formatTs(ts)}</span>
                  ) : (
                    <span className="text-[8px] text-gray-400">—</span>
                  )}
                </div>
              );
            })}
            {isTerminal && (
              <div className="flex-1 flex flex-col items-center min-w-0 px-0.5">
                {order.cancelled_at ? (
                  <span className="text-[8px] text-gray-500 text-center">{formatTs(order.cancelled_at)}</span>
                ) : (
                  <span className="text-[8px] text-gray-400">—</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start overflow-x-auto hide-scrollbar">
      {stepsToShow.map((step, i) => {
        const stepIdx = orderStepIndex(step.status);
        const done = currentIdx >= stepIdx || status === step.status;
        const ts = step.at(order);
        const prevDone = i > 0 && currentIdx >= orderStepIndex(stepsToShow[i - 1].status);
        return (
          <React.Fragment key={step.key}>
            {i > 0 && <div className={`shrink-0 w-4 h-0.5 mt-3 ${prevDone ? 'bg-green-400' : 'bg-gray-200'}`} />}
            <div className="flex flex-col items-center shrink-0 min-w-[44px]">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}
              >
                {done ? <Check size={12} strokeWidth={3} /> : <span className="text-[9px] font-bold">{i + 1}</span>}
              </div>
              <span className="text-[9px] font-medium text-gray-600 mt-1 text-center leading-tight">{step.label}</span>
              {ts ? <span className="text-[8px] text-gray-400 text-center">{formatTs(ts)}</span> : null}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function IncomingOrderActionBtns({
  onAccept,
  onReject,
  loading,
  acceptLabel,
  acceptDisabled,
  topRightLayout = true,
}: {
  onAccept: () => void;
  onReject: () => void;
  loading: boolean;
  acceptLabel?: string;
  acceptDisabled?: boolean;
  topRightLayout?: boolean;
}) {
  const btnBase =
    'rounded-xl font-medium disabled:opacity-50 min-w-0 transition-all duration-200 active:scale-[0.98] shadow-sm border border-transparent';
  const primaryFull = topRightLayout ? 'flex-[2] px-4 py-2.5 text-sm font-semibold' : '';
  const rejectHalf = topRightLayout ? 'flex-1 px-3 py-2.5 text-sm font-semibold' : '';

  return (
    <div className={`flex gap-2 items-center ${topRightLayout ? 'w-full flex-1' : 'flex-wrap'}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAccept();
        }}
        disabled={loading || acceptDisabled}
        className={`${btnBase} px-5 py-2.5 text-base font-semibold ${primaryFull} bg-green-600 text-white hover:bg-green-700 hover:shadow-md border-green-700/20`}
      >
        {acceptLabel || 'Accept'}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onReject();
        }}
        disabled={loading}
        className={`${btnBase} ${rejectHalf} bg-red-50 text-red-700 hover:bg-red-100 border-red-200/60`}
      >
        Reject
      </button>
    </div>
  );
}

/** Full accept modal — matches partnersite / store orders detail panel. */
export function MerchantIncomingOrderPanel({
  order,
  subtitle,
  otpCode,
  otpType,
  otpVerified,
  onClose,
  onAccept,
  onReject,
  actionLoading,
  acceptLabel,
  acceptDisabled,
}: {
  order: OrdersFoodRow;
  subtitle?: string;
  otpCode?: string;
  otpType?: string;
  otpVerified?: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  actionLoading: boolean;
  acceptLabel?: string;
  acceptDisabled?: boolean;
}) {
  const status = order.order_status || 'CREATED';
  const statusLabel = INCOMING_STATUS_LABEL[status] || status;

  return (
    <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <div className="shrink-0 flex items-center gap-3 border-b border-gray-200/60 bg-gradient-to-r from-gray-50 to-white px-4 py-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
          <FormattedOrderId formattedOrderId={order.formatted_order_id} fallbackOrderId={order.order_id} size="base" />
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-gradient-to-r from-slate-100 to-slate-50 px-3 py-1">
            <span className="text-xs font-semibold text-gray-700">OTP:</span>
            {otpCode ? (
              <>
                <span className="font-mono text-lg font-bold tracking-wider text-gray-900">{otpCode}</span>
                {otpType ? <span className="text-[10px] text-slate-600">({otpType})</span> : null}
                {otpVerified ? <span className="text-xs font-medium text-green-600">✓</span> : null}
              </>
            ) : (
              <span className="animate-pulse text-xs text-gray-500">Loading...</span>
            )}
          </div>
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
              status === 'CREATED' || status === 'NEW'
                ? 'bg-red-100 text-red-700'
                : status === 'DELIVERED'
                  ? 'bg-green-100 text-green-700'
                  : status === 'CANCELLED' || status === 'RTO'
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-blue-100 text-blue-700'
            }`}
          >
            {statusLabel}
          </span>
          <span className="text-[10px] text-gray-500">{formatTimeAgo(order.created_at)}</span>
        </div>
        <div className="hidden min-w-0 flex-1 items-center justify-center px-2 sm:flex">
          <OrderStatusTimeline order={order} compact />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-gray-100"
          aria-label="Close"
        >
          <X size={16} className="text-gray-500" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        <div className="flex flex-col items-start gap-4 lg:flex-row">
          <div className="flex w-full flex-shrink-0 flex-col gap-3 lg:w-auto lg:min-w-[260px]">
            {order.customer_name && (
              <div className="w-full rounded-lg border border-blue-100/60 bg-gradient-to-br from-blue-50/50 to-blue-100/30 p-3 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <User size={16} className="text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">{order.customer_name}</p>
                      {order.customer_scores && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                            (order.customer_scores.trust_score || 100) >= 80
                              ? 'bg-green-100 text-green-700'
                              : (order.customer_scores.trust_score || 100) >= 50
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {(order.customer_scores.trust_score || 100).toFixed(0)}
                        </span>
                      )}
                    </div>
                    {order.customer_phone && (
                      <a
                        href={`tel:${order.customer_phone}`}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <Phone size={12} /> {order.customer_phone}
                      </a>
                    )}
                    {(order.drop_address_raw || order.drop_address_normalized) && (
                      <div className="flex items-start gap-1.5 text-xs text-gray-700">
                        <MapPin size={12} className="mt-0.5 shrink-0 text-amber-600" />
                        <span className="leading-relaxed">{order.drop_address_normalized || order.drop_address_raw}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {order.delivery_instructions && (
              <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-2.5">
                <div className="flex items-start gap-2">
                  <MapPin size={12} className="mt-0.5 shrink-0 text-amber-600" />
                  <p className="text-xs leading-relaxed text-gray-700">{order.delivery_instructions}</p>
                </div>
              </div>
            )}

            {(order.requires_utensils ||
              (order.veg_non_veg && order.veg_non_veg !== 'na') ||
              order.is_fragile ||
              order.is_high_value) && (
              <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {order.requires_utensils && (
                    <span className="flex w-fit items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[10px] text-gray-700">
                      <UtensilsCrossed size={10} /> Utensils
                    </span>
                  )}
                  {order.veg_non_veg && order.veg_non_veg !== 'na' && (
                    <span className="w-fit rounded-md bg-green-100 px-2 py-0.5 text-[10px] text-green-800">
                      {formatVegNonVeg(order.veg_non_veg)}
                    </span>
                  )}
                  {order.is_fragile && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">Fragile</span>
                  )}
                  {order.is_high_value && (
                    <span className="rounded-md bg-yellow-100 px-2 py-0.5 text-[10px] text-yellow-800">High value</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex w-full items-center gap-2">
              <IncomingOrderActionBtns
                onAccept={onAccept}
                onReject={onReject}
                loading={actionLoading}
                acceptLabel={acceptLabel}
                acceptDisabled={acceptDisabled}
              />
            </div>

            <div className="w-full rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex justify-end">
                <span className="text-xs text-gray-500">{order.preparation_time_minutes ?? '—'}m prep</span>
              </div>
              <MerchantOrderItemsList
                items={(order.items ?? []) as NormalizedOrderLineItem[]}
                requiresUtensils={order.requires_utensils}
                utensilsLabel={getUtensilsCustomerLabel(order)}
                compact
              />
              {(order.items?.length ?? 0) === 0 ? (
                <p className="text-xs text-gray-500">{computeOrderItemQuantityCount(order)} items</p>
              ) : null}
              <div className="mt-2.5 flex items-center justify-between border-t border-gray-100 pt-2.5">
                <span className="text-xs text-gray-600">Total</span>
                <span className="font-bold text-gray-900">₹{Number(order.food_items_total_value || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {subtitle ? <p className="mt-3 text-center text-[10px] text-gray-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

/** Compact floating card when modal is dismissed — partnersite OrderCard style. */
export function MerchantIncomingOrderFloatingCard({
  order,
  storeLabel,
  onOpen,
  onAccept,
  onReject,
  loading,
  acceptDisabled,
}: {
  order: OrdersFoodRow;
  storeLabel?: string;
  onOpen: () => void;
  onAccept: () => void;
  onReject: () => void;
  loading: boolean;
  acceptDisabled?: boolean;
}) {
  const status = order.order_status || 'CREATED';
  const value = Number(order.food_items_total_value || 0);
  const label = INCOMING_STATUS_LABEL[status] ?? status;
  const itemCount = computeOrderItemQuantityCount(order);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className="w-[min(100vw-1.5rem,20rem)] cursor-pointer rounded-lg border-2 border-red-300 bg-red-50/50 p-3 shadow-lg ring-2 ring-red-200/50 transition-all sm:w-72"
    >
      <div className="mb-2 flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <FormattedOrderId formattedOrderId={order.formatted_order_id} fallbackOrderId={order.order_id} size="sm" />
          <p className="truncate text-xs text-gray-600">{storeLabel || order.customer_name || '—'}</p>
        </div>
        <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800">
          {label}
        </span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {formatTimeAgo(order.created_at)}
        </span>
        <span>•</span>
        <span>{itemCount} items</span>
        <span>•</span>
        <span className="font-semibold text-gray-900">₹{value.toFixed(0)}</span>
      </div>
      <div className="flex flex-col gap-2 border-t border-gray-100 pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading || acceptDisabled}
            onClick={onAccept}
            className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onReject}
            className="flex-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-0.5 self-start text-xs font-medium text-orange-600 hover:text-orange-700"
        >
          Details <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
