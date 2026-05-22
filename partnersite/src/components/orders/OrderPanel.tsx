'use client';

import React, { useEffect, useState } from 'react';
import {
  ChevronRight,
  Clock,
  HelpCircle,
  MapPin,
  Phone,
  Printer,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import type { OrderPricingBreakdown } from '@/lib/orderLineItems';
import { openMxNeedHelp } from '@/lib/openMxNeedHelp';
import { OrderItemDetailModal, type OrderLineItem } from '@/components/orders/OrderItemDetailModal';
import { OrderCancellationBanner } from '@/components/orders/OrderCancellationBanner';
import { OrderOtpSection } from '@/components/orders/OrderOtpSection';
import { ReadyHandoverRunningTimeline } from '@/components/orders/ReadyHandoverRunningTimeline';
import { formatRtoOtpDisplay, resolveOrderOtps, type CachedOrderOtps } from '@/lib/orderOtps';
import { getUtensilsCustomerLabel } from '@/lib/orderUtensilsLabel';
import { formatOrderDropAddress } from '@/lib/formatOrderAddress';

const ITEMS_PREVIEW_MAX = 8;

function resolveItemVegType(vegNonveg?: string | null, name?: string | null): 'veg' | 'non_veg' | null {
  const t = (vegNonveg ?? '').toLowerCase();
  if (t.includes('non') || t === 'non_veg') return 'non_veg';
  if (t.includes('veg')) return 'veg';
  const n = (name ?? '').toLowerCase();
  if (/\b(chicken|mutton|fish|prawn|shrimp|egg|meat|non[- ]?veg)\b/.test(n)) return 'non_veg';
  if (/\b(paneer|dal|veg|sabzi|aloo|gobi)\b/.test(n)) return 'veg';
  return null;
}

function ItemVegCheckbox({ vegNonveg, name }: { vegNonveg?: string | null; name?: string | null }) {
  const kind = resolveItemVegType(vegNonveg, name);
  const isVeg = kind === 'veg';
  const isNonVeg = kind === 'non_veg';

  const borderClass = isVeg
    ? 'border-green-600'
    : isNonVeg
      ? 'border-red-600'
      : 'border-black';

  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border bg-white ${borderClass}`}
      aria-hidden
    >
      {isVeg ? (
        <span className="h-2 w-2 rounded-full bg-green-600" />
      ) : isNonVeg ? (
        <span className="h-2 w-2 rounded-full bg-red-600" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-white ring-1 ring-inset ring-gray-300" title="Unclassified" />
      )}
    </span>
  );
}

function formatPlacedClock(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatPlacedAgo(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function PlacedTimeToggle({ createdAt }: { createdAt: string }) {
  const [showRelative, setShowRelative] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setShowRelative((v) => !v);
    }, 3500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className="inline-block min-w-[120px] tabular-nums">
      <span
        key={showRelative ? 'rel' : 'abs'}
        className="inline-block animate-in fade-in duration-300"
      >
        Placed: {showRelative ? formatPlacedAgo(createdAt) : formatPlacedClock(createdAt)}
      </span>
    </span>
  );
}

function customerOrdinalLabel(n: number | null | undefined): string | null {
  if (n == null || n < 1) return null;
  if (n === 1) return '1st order';
  if (n === 2) return '2nd order';
  if (n === 3) return '3rd order';
  return `${n}th order`;
}

function formatDropProximity(
  distanceKm?: number | null,
  etaSeconds?: number | null
): string | null {
  const parts: string[] = [];
  if (distanceKm != null && Number.isFinite(Number(distanceKm)) && Number(distanceKm) > 0) {
    const km = Number(distanceKm);
    parts.push(`${km % 1 === 0 ? km : km.toFixed(1)} kms`);
  }
  if (etaSeconds != null && Number.isFinite(Number(etaSeconds)) && Number(etaSeconds) > 0) {
    const mins = Math.max(1, Math.round(Number(etaSeconds) / 60));
    parts.push(`${mins} mins away`);
  }
  if (parts.length === 0) return null;
  return `(${parts.join(', ')})`;
}

export type OrderPanelProps = {
  order: OrdersFoodRow;
  pricing: OrderPricingBreakdown;
  formattedOrderId?: React.ReactNode;
  onOpenBill: () => void;
  onOpenCustomer: () => void;
  onOpenAllItems: () => void;
  onOpenTimeline: () => void;
  onPrintBill: () => void;
  onClose?: () => void;
  /** Live-order actions (accept, mark ready, etc.). Omit on read-only views like order history. */
  primaryAction?: React.ReactNode;
  otpCode?: string;
  otpType?: string;
  otpCache?: CachedOrderOtps;
  pickupVerified?: boolean;
  rtoVerified?: boolean;
  onViewPastRiders?: () => void;
  onTrackRider?: () => void;
  onOrderHelp?: () => void;
  className?: string;
  nowMs?: number;
};

export function OrderPanel({
  order,
  pricing,
  formattedOrderId,
  onOpenBill,
  onOpenCustomer,
  onOpenAllItems,
  onOpenTimeline,
  onPrintBill,
  onClose,
  primaryAction,
  otpCode,
  otpType,
  otpCache,
  pickupVerified,
  rtoVerified,
  onViewPastRiders,
  onTrackRider,
  onOrderHelp,
  className,
  nowMs,
}: OrderPanelProps) {
  const items = order.items ?? [];
  const previewItems = items.slice(0, ITEMS_PREVIEW_MAX);
  const hasMoreItems = items.length > ITEMS_PREVIEW_MAX;
  const [showPhone, setShowPhone] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OrderLineItem | null>(null);

  const storeOrdinalLabel = customerOrdinalLabel(order.customer_store_order_ordinal);
  const dropProximity = formatDropProximity(order.distance_km, order.eta_seconds);
  const addressText = formatOrderDropAddress(order.drop_address_normalized, order.drop_address_raw);

  const riderName =
    order.rider_details?.name || order.rider_name || (order.rider_id ? `Rider #${order.rider_id}` : null);
  const riderMobile = order.rider_details?.mobile || order.rider_phone;
  const riderPhoto = order.rider_details?.selfie_url;
  const status = order.order_status || 'CREATED';
  const isReadyForPickup = status === 'READY_FOR_PICKUP';
  const otps = resolveOrderOtps(order, otpCache);
  const legacyOtp = otpCode && !otps.pickup && !otps.rto ? { pickup: otpCode, rto: null as string | null } : otps;
  const displayOtps =
    legacyOtp.pickup || legacyOtp.rto
      ? { pickup: legacyOtp.pickup ?? otps.pickup, rto: legacyOtp.rto ?? otps.rto }
      : otps;
  const utensilsLabel = getUtensilsCustomerLabel(order);
  const rtoDisplay = formatRtoOtpDisplay(status, displayOtps.rto);
  const showRiderCard =
    !!riderName || !!displayOtps.pickup || !!displayOtps.rto || !!otpCode || !!onViewPastRiders;

  return (
    <div
      className={`relative flex flex-col h-auto max-h-[calc(100dvh-10rem)] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${className ?? ''}`}
    >
      <div className="flex flex-col xl:flex-row divide-y xl:divide-y-0 xl:divide-x divide-dashed divide-gray-200 overflow-y-auto hide-scrollbar flex-1 min-h-0">
        <div className="flex flex-col p-4 xl:w-[32%] min-w-0 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="inline-flex w-fit items-center rounded-md bg-violet-100 px-2.5 py-1 text-[10px] font-bold tracking-wide text-violet-800">
              GatiMitra - LiveOps
            </span>
            <button
              type="button"
              onClick={onPrintBill}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 shrink-0"
            >
              <Printer size={13} />
              Print bill
            </button>
          </div>

          <div className="mb-2 pr-6">
            {formattedOrderId ?? (
              <p className="text-2xl font-bold text-gray-900 tracking-tight">
                ID: {order.formatted_order_id || order.order_id}
              </p>
            )}
          </div>

          {order.customer_name && (
            <div className="space-y-1 mb-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={onOpenCustomer}
                  className="inline-flex items-center gap-0.5 text-sm font-semibold text-blue-600 hover:text-blue-800 min-w-0"
                >
                  <span className="truncate">{order.customer_name}</span>
                  <ChevronRight size={14} className="shrink-0" />
                </button>
                {order.customer_phone && (
                  <button
                    type="button"
                    onClick={() => setShowPhone((v) => !v)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800 shrink-0"
                  >
                    <Phone size={14} />
                    {showPhone ? order.customer_phone : 'Call'}
                  </button>
                )}
              </div>
              {storeOrdinalLabel && (
                <p className="text-xs text-gray-500">{storeOrdinalLabel}</p>
              )}
            </div>
          )}

          {addressText ? (
            <p className="text-xs text-gray-600 leading-relaxed mb-4">
              {addressText}
              {dropProximity ? (
                <span className="text-gray-500"> {dropProximity}</span>
              ) : null}
            </p>
          ) : dropProximity ? (
            <p className="text-xs text-gray-600 leading-relaxed mb-4">{dropProximity}</p>
          ) : null}

          <div className="mb-3 space-y-2">
            <OrderCancellationBanner order={order} />
            <OrderOtpSection
              status={status}
              otps={displayOtps}
              pickupVerified={pickupVerified}
              rtoVerified={rtoVerified}
              compact
            />
          </div>

          <div className="mt-3 pt-3 border-t border-dashed border-gray-200 flex items-center justify-between text-xs text-gray-600 gap-2">
            <PlacedTimeToggle createdAt={order.created_at} />
            <button
              type="button"
              onClick={onOpenTimeline}
              className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline shrink-0"
            >
              <Clock size={14} />
              Timeline
            </button>
          </div>

          {isReadyForPickup ? (
            <div className="mt-3.5">
              <ReadyHandoverRunningTimeline
                order={order}
                nowMs={nowMs ?? Date.now()}
                compact
                placement="panel"
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col p-4 flex-1 min-w-0">
          {utensilsLabel ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-900">
              <UtensilsCrossed size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              <span className="font-medium leading-snug">{utensilsLabel}</span>
            </div>
          ) : null}

          <div className="space-y-3">
            {previewItems.length > 0 ? (
              <>
                {previewItems.map((item, idx) => {
                  const qty = item.quantity || 1;
                  const amount = Number(item.total || (item.price || 0) * qty);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedItem(item)}
                      className="w-full flex items-start justify-between gap-3 text-sm text-left rounded-lg px-1 py-0.5 -mx-1 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <ItemVegCheckbox vegNonveg={item.vegNonveg} name={item.name} />
                        <span className="text-gray-900">
                          <span className="font-medium">{qty} x </span>
                          <span className="underline decoration-gray-400 underline-offset-2">
                            {item.name || `Item ${idx + 1}`}
                          </span>
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900 tabular-nums shrink-0">
                        ₹{amount.toFixed(0)}
                      </span>
                    </button>
                  );
                })}
                {hasMoreItems && (
                  <button
                    type="button"
                    onClick={onOpenAllItems}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    +{items.length - ITEMS_PREVIEW_MAX} more
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">No items listed</p>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onOpenBill}
              className="w-full flex items-center justify-between gap-2 text-left group"
            >
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800 underline decoration-dashed decoration-gray-400 underline-offset-4 group-hover:decoration-blue-500 group-hover:text-blue-700">
                  Total Bill
                </span>
                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 border border-teal-100">
                  PAID
                </span>
              </span>
              <span className="text-lg font-bold text-gray-900 tabular-nums">
                ₹{pricing.total.toFixed(0)}
              </span>
            </button>
          </div>

          {primaryAction && !isReadyForPickup ? (
            <div className="mt-4 shrink-0 w-full [&_button]:w-full [&_[aria-label='More actions']]:hidden">
              {primaryAction}
            </div>
          ) : null}
        </div>

        <div className="relative flex flex-col p-4 xl:w-[28%] min-w-[240px] shrink-0 gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-2 right-2 z-20 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              aria-label="Close order"
            >
              <X size={18} />
            </button>
          )}
          {showRiderCard && (
            <div className="mt-8 flex min-h-[180px] flex-col rounded-xl border border-gray-200 bg-gradient-to-b from-slate-50 to-white p-4 shadow-sm">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Delivery partner</p>
              </div>
              <div className="flex flex-1 flex-col gap-3">
              <div className="flex gap-3">
                {riderPhoto ? (
                  <img
                    src={riderPhoto}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-full border-2 border-white object-cover shadow-sm ring-1 ring-gray-200"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-100 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">
                    {riderName ? `${riderName} has arrived` : 'Delivery partner'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    {riderMobile && (
                      <span className="font-semibold text-gray-800 tabular-nums">{riderMobile}</span>
                    )}
                    {displayOtps.pickup && (
                      <>
                        {riderMobile && <span className="text-gray-300">|</span>}
                        <span className="font-mono font-bold text-gray-900">Pickup: {displayOtps.pickup}</span>
                      </>
                    )}
                    {rtoDisplay && (
                      <>
                        {(riderMobile || displayOtps.pickup) && <span className="text-gray-300">|</span>}
                        <span className="font-mono font-bold text-orange-800">RTO: {rtoDisplay}</span>
                      </>
                    )}
                    {!displayOtps.pickup && !displayOtps.rto && otpCode && (
                      <>
                        {riderMobile && <span className="text-gray-300">|</span>}
                        <span className="font-mono font-bold text-gray-900">OTP: {otpCode}</span>
                        {otpType && <span className="text-gray-500">({otpType})</span>}
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onTrackRider}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                    disabled={!onTrackRider}
                  >
                    <MapPin size={12} />
                    Track location
                  </button>
                </div>
              </div>
              </div>
            </div>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-2">
            {onViewPastRiders ? (
              <button
                type="button"
                onClick={onViewPastRiders}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-800 hover:bg-gray-50"
              >
                View past riders
              </button>
            ) : null}
            <button
              type="button"
              onClick={() =>
                onOrderHelp
                  ? onOrderHelp()
                  : openMxNeedHelp({
                      formattedOrderId: order.formatted_order_id ?? undefined,
                      coreOrderId: order.order_id,
                    })
              }
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
            >
              <HelpCircle size={16} />
              Order help
            </button>
          </div>
        </div>
      </div>

      <OrderItemDetailModal
        open={selectedItem != null}
        onClose={() => setSelectedItem(null)}
        item={selectedItem}
      />
    </div>
  );
}
