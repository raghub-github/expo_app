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
import { MerchantOrderItemsList } from '@/components/orders/MerchantOrderItemsList';
import { MerchantOrderBillSummary } from '@/components/orders/MerchantOrderBillSummary';
import { OrderCancellationBanner } from '@/components/orders/OrderCancellationBanner';
import { OrderOtpSection } from '@/components/orders/OrderOtpSection';
import { ReadyHandoverRunningTimeline } from '@/components/orders/ReadyHandoverRunningTimeline';
import { formatRtoOtpDisplay, resolveOrderOtps, type CachedOrderOtps } from '@/lib/orderOtps';
import { resolveMerchantInstructionsForDisplay } from '@/lib/merchant-order-instructions';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';
import { RiderDeliveryPartnerCard } from '@/components/orders/RiderDeliveryPartnerCard';
import { RiderAssignPendingCard } from '@/components/orders/RiderAssignPendingCard';
import { useNearbyDispatchRiders } from '@/hooks/useNearbyDispatchRiders';
import { useRiderArrivalToMerchant } from '@/hooks/useRiderArrivalToMerchant';
import { hasRiderReachedMerchant } from '@/lib/rider-merchant-arrival-display';
import { deliveryEtaMinutesLabel } from '@/lib/order-prep-time';
import { formatOrderDropAddress } from '@/lib/formatOrderAddress';
import { usePastRidersEligibility } from '@/hooks/usePastRidersEligibility';

/** Panel preview only — full list via sidesheet (+N more). No scroll on items. */
const ITEMS_PREVIEW_MAX = 4;

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
  onOpenRiderPhoto?: (url: string) => void;
  onOrderHelp?: () => void;
  onUniformFeedback?: (inUniform: boolean) => void;
  uniformFeedback?: boolean | null;
  className?: string;
  nowMs?: number;
  /** Live pipeline vs completed order history (badge label). */
  panelMode?: 'live' | 'history';
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
  onOpenRiderPhoto,
  onOrderHelp,
  onUniformFeedback,
  uniformFeedback,
  className,
  nowMs,
  panelMode = 'live',
}: OrderPanelProps) {
  const items = order.items ?? [];
  const previewItems = items.slice(0, ITEMS_PREVIEW_MAX);
  const hasMoreItems = items.length > ITEMS_PREVIEW_MAX;
  const totalItemCount = computeOrderItemQuantityCount(order);
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
  const isPickedUp = status === 'OUT_FOR_DELIVERY';
  const deliveryLabel = deliveryEtaMinutesLabel(order.eta_seconds);
  const riderReachedMerchant = hasRiderReachedMerchant({
    core_status: order.core_status,
    current_status: order.current_status,
    reached_merchant_at:
      (order as { reached_merchant_at?: string | null }).reached_merchant_at ?? null,
  });
  const riderAssigned = !!(
    order.rider_id ??
    order.rider_details?.id ??
    order.rider_name ??
    order.rider_phone
  );
  const terminalStatus = ['DELIVERED', 'CANCELLED', 'RTO'].includes(status);
  const showPendingRiderAssign =
    panelMode === 'live' && !riderAssigned && !terminalStatus;
  const { summary: nearbyRiderSummary, loading: nearbyRidersLoading } = useNearbyDispatchRiders(
    order.id,
    showPendingRiderAssign
  );
  const otps = resolveOrderOtps(order, otpCache);
  const legacyOtp = otpCode && !otps.pickup && !otps.rto ? { pickup: otpCode, rto: null as string | null } : otps;
  const displayOtps =
    legacyOtp.pickup || legacyOtp.rto
      ? { pickup: legacyOtp.pickup ?? otps.pickup, rto: legacyOtp.rto ?? otps.rto }
      : otps;
  const merchantInstructions = resolveMerchantInstructionsForDisplay(order);
  const rtoDisplay = formatRtoOtpDisplay(status, displayOtps.rto);
  const showPastRidersButton = usePastRidersEligibility(order.id, !!onViewPastRiders);
  const showRiderCard =
    riderAssigned ||
    !!riderName ||
    !!displayOtps.pickup ||
    !!displayOtps.rto ||
    !!otpCode;

  const riderEnRouteToMerchant =
    showRiderCard && riderAssigned && !isPickedUp && !riderReachedMerchant;
  const { arrivalSubtitle: riderArrivalSubtitle } = useRiderArrivalToMerchant(
    order.id,
    riderEnRouteToMerchant
  );

  const riderCardVariant = isPickedUp
    ? 'picked_up'
    : riderReachedMerchant
      ? 'arrived'
      : 'on_the_way';

  return (
    <div
      className={`relative flex flex-col h-auto max-h-[calc(100dvh-10rem)] bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${className ?? ''}`}
    >
      <div className="flex flex-col xl:flex-row xl:items-stretch divide-y xl:divide-y-0 xl:divide-x divide-dashed divide-gray-200 overflow-y-auto hide-scrollbar flex-1 min-h-0">
        <div className="flex flex-col p-4 xl:w-[32%] min-w-0 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span
              className={`inline-flex w-fit items-center rounded-md px-2.5 py-1 text-[10px] font-bold tracking-wide ${
                panelMode === 'history'
                  ? 'bg-slate-100 text-slate-700'
                  : 'bg-violet-100 text-violet-800'
              }`}
            >
              {panelMode === 'history' ? 'Order history' : 'GatiMitra - LiveOps'}
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
              merchantInstructions={merchantInstructions}
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

          {primaryAction ? (
            <div className="mt-3 shrink-0 w-full [&_button]:min-h-[44px] [&_[aria-label='More actions']]:hidden">
              {primaryAction}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col p-4 flex-1 min-w-0 min-h-0">
          <MerchantOrderItemsList
            items={previewItems}
            totalItemCount={totalItemCount}
            totalLineCount={items.length}
            showUtensilsBanner={false}
            onItemClick={(item) => setSelectedItem(item as OrderLineItem)}
          />
          {hasMoreItems ? (
            <button
              type="button"
              onClick={onOpenAllItems}
              className="mt-2 w-full rounded-lg border border-blue-200 bg-blue-50 py-2.5 text-sm font-bold text-blue-700 hover:bg-blue-100"
            >
              +{items.length - ITEMS_PREVIEW_MAX} more items — view all
            </button>
          ) : null}

          <MerchantOrderBillSummary
            className="mt-4 shrink-0"
            items={items}
            pricing={pricing}
            onTotalClick={onOpenBill}
          />
        </div>

        <div className="relative flex flex-col flex-1 self-stretch p-4 xl:w-[28%] min-w-[240px] shrink-0 min-h-[240px] xl:min-h-0">
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
          {showPendingRiderAssign ? (
            <RiderAssignPendingCard
              className="mt-6 flex-1 min-h-0"
              nearbyCount={nearbyRiderSummary?.nearbyCount ?? 0}
              assignSoonMessage={
                nearbyRiderSummary?.assignSoonMessage ??
                'Looking for nearby riders — we will assign one soon'
              }
              radiusKm={nearbyRiderSummary?.radiusKm}
              loading={nearbyRidersLoading && !nearbyRiderSummary}
            />
          ) : showRiderCard ? (
            <RiderDeliveryPartnerCard
              className="mt-6 flex-1 min-h-0"
              riderName={riderName ?? 'Delivery partner'}
              riderPhone={riderMobile}
              riderSelfieUrl={riderPhoto}
              variant={riderCardVariant}
              arrivalSubtitle={riderEnRouteToMerchant ? riderArrivalSubtitle : undefined}
              pickupOtp={riderReachedMerchant ? displayOtps.pickup : undefined}
              rtoDisplay={riderReachedMerchant ? (rtoDisplay ?? undefined) : undefined}
              legacyOtp={
                riderReachedMerchant && !displayOtps.pickup && !displayOtps.rto ? otpCode : undefined
              }
              legacyOtpType={otpType}
              deliveryLabel={isPickedUp ? deliveryLabel ?? undefined : undefined}
              onTrackRider={onTrackRider}
              onOpenRiderPhoto={onOpenRiderPhoto}
              onUniformFeedback={isPickedUp ? onUniformFeedback : undefined}
              uniformFeedback={uniformFeedback}
            />
          ) : null}

          <div className="mt-auto shrink-0 flex flex-col gap-2.5 pt-5 w-full">
            {showPastRidersButton && onViewPastRiders ? (
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
