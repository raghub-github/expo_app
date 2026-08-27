'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  ShoppingBag,
  Receipt,
  ChevronUp,
  ChevronDown,
  Copy,
  Printer,
  Volume2,
  VolumeX,
  MoreVertical,
  Leaf,
  UtensilsCrossed,
  Check,
} from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';
import { resolveMerchantCtm } from '@/lib/merchant-order-ctm';
import { formatOrderRs } from '@/lib/merchant-order-item-display';
import {
  isPrepCountdownExpired,
  prepReadyCountdownLabel,
  canUseNeedMoreTime,
} from '@/lib/order-prep-time';
import { getUtensilsCustomerLabel } from '@/lib/orderUtensilsLabel';
import { MarkAsReadyCountdownButton } from '@/components/orders/MarkAsReadyCountdownButton';
import { RiderAssignPendingCard } from '@/components/orders/RiderAssignPendingCard';
import { useNearbyDispatchRiders } from '@/hooks/useNearbyDispatchRiders';
import { isPartnerSelfPickupOrder } from '@/lib/partner-delivery-type';
import { usePastRidersEligibility } from '@/hooks/usePastRidersEligibility';

function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function formatOrderPlacedLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleString('en-IN', { month: 'short' });
    const time = d.toLocaleString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${day} ${month}, ${time}`;
  } catch {
    return '—';
  }
}

function customerOrderLabel(order: OrdersFoodRow): string {
  const name = (order.customer_name || 'Customer').trim();
  const ord = order.customer_store_order_ordinal;
  if (ord != null && ord > 0) {
    return `${name}'s ${ord}${ordinalSuffix(ord)} order`;
  }
  const count = order.customer_order_count;
  if (count != null && count > 0) {
    return `${name}'s ${count}${ordinalSuffix(count)} order`;
  }
  return `${name}'s order`;
}

function vegBadgeLabel(veg: OrdersFoodRow['veg_non_veg']): string | null {
  if (veg === 'veg') return 'VEG ONLY';
  if (veg === 'non_veg') return 'NON VEG ONLY';
  if (veg === 'mixed') return 'MIXED';
  return null;
}

function VegIndicator({ veg }: { veg?: string | null }) {
  const v = String(veg || '').toLowerCase();
  if (v.includes('non')) {
    return (
      <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
      </span>
    );
  }
  if (v === 'veg' || !v) {
    return (
      <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-700" />
      </span>
    );
  }
  return (
    <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-amber-600">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
    </span>
  );
}

function formatItemLine(item: NonNullable<OrdersFoodRow['items']>[number]): string {
  const qty = item.quantity ?? 1;
  const name = item.name || 'Item';
  const extras: string[] = [];
  if (item.variantTag) extras.push(item.variantTag);
  if (item.variantName && item.variantName !== item.variantTag) extras.push(item.variantName);
  const suffix = extras.length ? ` [${extras.join(', ')}]` : '';
  return `${qty} x ${name}${suffix}`;
}

function OrderIdRow({
  formattedOrderId,
  fallbackOrderId,
}: {
  formattedOrderId?: string | null;
  fallbackOrderId: number;
}) {
  const [copied, setCopied] = useState(false);
  const display = formattedOrderId
    ? formattedOrderId.startsWith('#')
      ? formattedOrderId
      : `#${formattedOrderId}`
    : `#${fallbackOrderId}`;

  const onCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(display.replace(/^#/, ''));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore */
      }
    },
    [display]
  );

  const idBody = display.replace(/^#/, '');
  const prefix = idBody.length > 4 ? idBody.slice(0, -4) : idBody;
  const last4 = idBody.length > 4 ? idBody.slice(-4) : '';

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[#1A1A1A] font-extrabold tracking-tight text-lg leading-none">
        #{prefix}
        {last4 ? <span className="text-[#1A1A1A]">{last4}</span> : null}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        aria-label="Copy order ID"
      >
        {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export type MerchantPreparingOrderCardProps = {
  order: OrdersFoodRow;
  storeName?: string | null;
  selected?: boolean;
  onClick?: () => void;
  onReady: () => void | Promise<void>;
  onNeedMoreTime?: () => void;
  onPrint?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onMenu?: () => void;
  loading?: boolean;
  nowMs: number;
};

export function MerchantPreparingOrderCard({
  order,
  storeName,
  selected,
  onClick,
  onReady,
  onNeedMoreTime,
  onPrint,
  soundEnabled = true,
  onToggleSound,
  onMenu,
  loading,
  nowMs,
}: MerchantPreparingOrderCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [billOpen, setBillOpen] = useState(false);

  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = computeOrderItemQuantityCount(order);
  const total =
    resolveMerchantCtm(order);
  const badge = vegBadgeLabel(order.veg_non_veg);
  const utensilsLabel = getUtensilsCustomerLabel(order);
  const showCutlery =
    utensilsLabel != null &&
    (order.requires_utensils === true || /send cutlery/i.test(utensilsLabel));

  const riderName = order.rider_details?.name || order.rider_name;
  const riderSelfie = order.rider_details?.selfie_url;
  const riderAssigned = !!(riderName || order.rider_id || order.rider_phone);
  const isSelfPickup = isPartnerSelfPickupOrder(order);
  const showPendingRider = !isSelfPickup && !riderAssigned;
  const { summary: nearbyRiderSummary } = useNearbyDispatchRiders(order.id, showPendingRider);
  const hadPastRiderAssign = usePastRidersEligibility(order.id, showPendingRider);
  const etaMins =
    order.eta_seconds != null && Number.isFinite(order.eta_seconds)
      ? Math.max(1, Math.round(Number(order.eta_seconds) / 60))
      : null;

  const riderLine = useMemo(() => {
    if (riderName && etaMins) return `Rider is arriving in ${etaMins} mins`;
    if (riderName) return `${riderName} is on the way`;
    if (etaMins) return `Rider is arriving in ${etaMins} mins`;
    return 'Assigning delivery partner…';
  }, [riderName, etaMins]);

  const prepExpired =
    isPrepCountdownExpired(order, nowMs) ||
    !prepReadyCountdownLabel(order, nowMs, { prefix: 'Order Ready' }).label.includes('(');

  const canNeedMore =
    prepExpired &&
    !!onNeedMoreTime &&
    canUseNeedMoreTime(
      order.prep_delay_use_count,
      Boolean(order.is_bulk_order),
      order.prep_delay_minutes
    );

  const restaurantLabel =
    (storeName || order.restaurant_name || '').trim() || 'Restaurant';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`w-full overflow-hidden rounded-2xl border bg-white shadow-[0_2px_16px_rgba(0,0,0,0.08)] transition-all ${
        selected ? 'border-gray-900 ring-2 ring-gray-200' : 'border-[#EEEEEE]'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {badge ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-[#E8F5E9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#2E7D32]">
                  <Leaf size={11} strokeWidth={2.5} aria-hidden />
                  {badge}
                </span>
              ) : null}
              {isSelfPickup ? (
                <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                  Self-Pick-Up
                </span>
              ) : null}
            </div>
            {isSelfPickup ? (
              <p className="mt-1.5 text-[11px] font-semibold text-amber-800">
                Customer will collect this order from the store.
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <OrderIdRow
                formattedOrderId={order.formatted_order_id}
                fallbackOrderId={order.order_id}
              />
              <span
                className="min-w-0 flex-1 truncate text-xs font-medium text-[#666666]"
                title={restaurantLabel}
              >
                {restaurantLabel}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrint?.();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F0F0F0] text-[#444444] hover:bg-[#E5E5E5] transition-colors"
              aria-label="Print order"
            >
              <Printer size={16} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSound?.();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F0F0F0] text-[#444444] hover:bg-[#E5E5E5] transition-colors"
              aria-label={soundEnabled ? 'Mute alerts' : 'Enable alerts'}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMenu?.();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F0F0F0] text-[#444444] hover:bg-[#E5E5E5] transition-colors"
              aria-label="More options"
            >
              <MoreVertical size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Customer + time */}
      <div className="flex items-center justify-between gap-3 border-b border-[#EEEEEE] px-4 pb-3">
        <p className="text-sm font-semibold text-[#1A1A1A] truncate">{customerOrderLabel(order)}</p>
        <p className="shrink-0 text-xs font-medium text-[#666666]">
          {formatOrderPlacedLabel(order.created_at)}
        </p>
      </div>

      {/* Details */}
      <div className="border-b border-[#EEEEEE]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/80 transition-colors"
        >
          <ShoppingBag size={18} className="shrink-0 text-[#444444]" strokeWidth={2} />
          <span className="flex-1 text-sm font-semibold text-[#1A1A1A]">Details</span>
          <span className="text-xs font-medium text-[#666666]">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
          {detailsOpen ? (
            <ChevronUp size={18} className="text-[#666666]" />
          ) : (
            <ChevronDown size={18} className="text-[#666666]" />
          )}
        </button>
        {detailsOpen ? (
          <div className="space-y-2 px-4 pb-3">
            {items.length === 0 ? (
              <p className="text-xs text-[#666666]">No items listed</p>
            ) : (
              items.map((item, idx) => (
                <div key={`${item.name}-${idx}`} className="flex items-start gap-2">
                  <VegIndicator veg={item.vegNonveg ?? order.veg_non_veg} />
                  <span className="text-sm font-semibold text-[#1A1A1A] border-b border-dashed border-[#999999] pb-0.5 leading-snug">
                    {formatItemLine(item)}
                  </span>
                </div>
              ))
            )}
            {showCutlery ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-[#F3F3F3] px-3 py-2.5">
                <UtensilsCrossed size={16} className="shrink-0 text-[#2E7D32]" />
                <span className="text-xs font-medium text-[#333333]">Send cutlery</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Total bill */}
      <div className="border-b border-[#EEEEEE]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setBillOpen((v) => !v)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/80 transition-colors"
        >
          <Receipt size={18} className="shrink-0 text-[#444444]" strokeWidth={2} />
          <span className="flex-1 text-sm font-semibold text-[#1A1A1A]">Total bill</span>
          <span className="text-sm font-bold text-[#1A1A1A]">{formatOrderRs(Number(total))}</span>
          {billOpen ? (
            <ChevronUp size={18} className="text-[#666666]" />
          ) : (
            <ChevronDown size={18} className="text-[#666666]" />
          )}
        </button>
        {billOpen && order.pricing ? (
          <div className="space-y-1 px-4 pb-3 text-xs text-[#666666]">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatOrderRs(Number(order.pricing.subtotal))}</span>
            </div>
            {order.pricing.packaging > 0 ? (
              <div className="flex justify-between">
                <span>Packaging</span>
                <span>{formatOrderRs(Number(order.pricing.packaging))}</span>
              </div>
            ) : null}
            {order.pricing.taxes > 0 ? (
              <div className="flex justify-between">
                <span>Taxes</span>
                <span>{formatOrderRs(Number(order.pricing.taxes))}</span>
              </div>
            ) : null}
            {order.pricing.discount > 0 ? (
              <div className="flex justify-between text-green-700">
                <span>Discount</span>
                <span>-{formatOrderRs(Number(order.pricing.discount))}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Rider / Self-Pick-Up */}
      {isSelfPickup ? (
        <div className="mx-4 mb-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-900">
            Self-Pick-Up
          </p>
          <p className="mt-1 text-[12px] font-semibold text-amber-800">
            Customer will collect this order from the store.
          </p>
        </div>
      ) : showPendingRider ? (
        <div onClick={(e) => e.stopPropagation()}>
          <RiderAssignPendingCard
            nearbyCount={nearbyRiderSummary?.nearbyCount ?? 0}
            assignSoonMessage={
              nearbyRiderSummary?.assignSoonMessage ??
              'Looking for nearby riders, assigning one soon'
            }
            radiusKm={nearbyRiderSummary?.radiusKm}
            statusSubtitle={
              hadPastRiderAssign ? 'Previous rider was unassigned' : null
            }
          />
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#E8E8E8]">
            {riderSelfie ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={riderSelfie} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#888888]">
                {riderName ? riderName.charAt(0).toUpperCase() : '?'}
              </div>
            )}
          </div>
          <p className="text-sm font-medium text-[#1A1A1A]">{riderLine}</p>
        </div>
      )}

      {/* Order Ready CTA */}
      <div className="px-4 pb-4 pt-0" onClick={(e) => e.stopPropagation()}>
        {prepExpired && canNeedMore ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={onNeedMoreTime}
              className="min-h-[48px] rounded-xl border border-[#2563EB] bg-white px-3 py-2.5 text-sm font-semibold text-[#2563EB] hover:bg-blue-50 disabled:opacity-50"
            >
              Need more time
            </button>
            <MarkAsReadyCountdownButton
              order={order}
              nowMs={nowMs}
              disabled={loading}
              fullWidth
              theme="light"
              labelPrefix="Order Ready"
              className="min-h-[48px] rounded-xl"
              onClick={(e) => {
                e.stopPropagation();
                void onReady();
              }}
            />
          </div>
        ) : (
          <MarkAsReadyCountdownButton
            order={order}
            nowMs={nowMs}
            disabled={loading}
            fullWidth
            theme="light"
            labelPrefix="Order Ready"
            className="min-h-[48px] rounded-xl"
            onClick={(e) => {
              e.stopPropagation();
              void onReady();
            }}
          />
        )}
      </div>
    </div>
  );
}
