'use client';

import React from 'react';
import {
  Bike,
  Clock,
  HelpCircle,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  UtensilsCrossed,
  User,
} from 'lucide-react';
import type { OrdersFoodRow } from '@/lib/types/food-orders';
import { FormattedOrderId, formatTimeAgo } from '@/components/merchant/merchant-incoming-order-ui';
import { MerchantOrderItemsList } from '@/components/orders/MerchantOrderItemsList';
import { getUtensilsCustomerLabel } from '@/lib/orderUtensilsLabel';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';
import { resolveMerchantCtm } from '@/lib/merchant-order-item-display';
import { MarkAsReadyCountdownButton } from '@/components/orders/MarkAsReadyCountdownButton';
import { MerchantPreparingOrderCard } from '@/components/merchant/MerchantPreparingOrderCard';
import { ReadyHandoverRunningTimeline } from '@/components/orders/ReadyHandoverRunningTimeline';
import {
  deliveryEtaMinutesLabel,
  isPrepCountdownExpired,
  prepReadyCountdownLabel,
  resolvePreparedLateMinutes,
} from '@/lib/order-prep-time';
import { OrderPreparedLateTopBanner } from '@/components/merchant/MerchantPreparingOrderActions';
import { canMerchantMarkDelivered } from '@/lib/merchantActiveOrders';
import { RiderDeliveryPartnerCard } from '@/components/orders/RiderDeliveryPartnerCard';

function vegDot(veg?: string | null) {
  const v = String(veg || '').toLowerCase();
  if (v.includes('non')) return 'bg-red-600';
  if (v === 'veg') return 'bg-green-600';
  return 'bg-gray-400';
}

function formatPlacedAt(createdAt: string) {
  try {
    return new Date(createdAt).toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export function MerchantOrderPipelineCard({
  order,
  selected,
  onClick,
  onPrintKot,
  onPrintOrder,
  onTimeline,
  onAccept,
  onReject,
  onReady,
  onNeedMoreTime,
  onDispatch,
  onComplete,
  onRto,
  acceptLabel,
  acceptDisabled,
  onCallCustomer,
  onCallRider,
  onTrackRider,
  onUniformFeedback,
  uniformFeedback,
  loading,
  nowMs,
}: {
  order: OrdersFoodRow;
  selected?: boolean;
  onClick?: () => void;
  onPrintKot?: () => void;
  onPrintOrder?: () => void;
  onTimeline?: () => void;
  onAccept?: () => void | Promise<void | boolean>;
  onReject?: () => void;
  onReady: () => void | Promise<void>;
  onNeedMoreTime: () => void;
  onDispatch?: () => void;
  onComplete?: () => void | Promise<void | boolean>;
  onRto?: () => void;
  acceptLabel?: string;
  acceptDisabled?: boolean;
  onCallCustomer?: () => void;
  onCallRider?: () => void;
  onTrackRider?: () => void;
  onUniformFeedback?: (inUniform: boolean) => void;
  uniformFeedback?: boolean | null;
  loading?: boolean;
  nowMs: number;
}) {
  const status = String(order.order_status || '').toUpperCase();
  const isNew = status === 'CREATED' || status === 'NEW';
  const isPreparing = status === 'PREPARING' || status === 'ACCEPTED';
  const isReady = status === 'READY_FOR_PICKUP';
  const isPickedUp = status === 'OUT_FOR_DELIVERY';
  const isRto = status === 'RTO';

  const pricing = order.pricing;
  const total = pricing?.total ?? resolveMerchantCtm(order);
  const itemCount = computeOrderItemQuantityCount(order);
  const riderName =
    order.rider_details?.name || order.rider_name || 'Delivery partner';
  const riderPhone = order.rider_details?.mobile || order.rider_phone;
  const lateMins = resolvePreparedLateMinutes(order) ?? 0;
  const deliveryLabel = deliveryEtaMinutesLabel(order.eta_seconds);
  const prepCountdown = prepReadyCountdownLabel(order, nowMs);
  const prepExpired =
    isPreparing &&
    (isPrepCountdownExpired(order, nowMs) || !prepCountdown.label.includes('('));
  const addressLine =
    order.drop_address_normalized || order.drop_address_raw || '';
  const distanceLabel =
    order.distance_km != null
      ? `${Number(order.distance_km).toFixed(0)} kms${order.eta_seconds ? `, ${Math.max(1, Math.round(Number(order.eta_seconds) / 60))} mins away` : ''}`
      : null;

  if (isPreparing) {
    return (
      <MerchantPreparingOrderCard
        order={order}
        storeName={order.restaurant_name}
        selected={selected}
        onClick={onClick}
        onReady={onReady}
        onNeedMoreTime={onNeedMoreTime}
        onPrintKot={onPrintKot}
        onPrint={onPrintOrder}
        loading={loading}
        nowMs={nowMs}
      />
    );
  }

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
      className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-all ${
        selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-gray-200 hover:border-gray-300'
      } ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="bg-violet-100 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-violet-800">
        GatiMitra · Delivery
      </div>

      {(isReady || isPickedUp) && lateMins > 0 ? (
        <OrderPreparedLateTopBanner lateMinutes={lateMins} />
      ) : null}

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.2fr)_minmax(220px,1fr)] lg:divide-x lg:divide-dashed lg:divide-gray-200">
        {/* Left — order & customer */}
        <div className="p-4" onClick={(e) => e.stopPropagation()}>
          <FormattedOrderId
            formattedOrderId={order.formatted_order_id}
            fallbackOrderId={order.order_id}
            size="base"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPrintKot}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              <Printer size={12} /> KOT
            </button>
            <button
              type="button"
              onClick={onPrintOrder}
              className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              <Printer size={12} /> ORDER
            </button>
          </div>

          <div className="mt-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-sm font-semibold text-blue-700">
                  <User size={14} className="shrink-0" />
                  <span className="truncate">{order.customer_name || 'Customer'}</span>
                </p>
                {order.customer_store_order_ordinal != null && (
                  <p className="text-xs text-gray-500">
                    {order.customer_store_order_ordinal}
                    {order.customer_store_order_ordinal === 1
                      ? 'st'
                      : order.customer_store_order_ordinal === 2
                        ? 'nd'
                        : order.customer_store_order_ordinal === 3
                          ? 'rd'
                          : 'th'}{' '}
                    order
                  </p>
                )}
                {addressLine && (
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">
                    {addressLine}
                    {distanceLabel ? ` (${distanceLabel})` : ''}
                  </p>
                )}
              </div>
              {order.customer_phone && (
                <a
                  href={`tel:${order.customer_phone}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCallCustomer?.();
                  }}
                  className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                >
                  <Phone size={12} className="inline mr-0.5" />
                  Call
                </a>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>Placed: {formatPlacedAt(order.created_at)}</span>
            <span>·</span>
            <span>{formatTimeAgo(order.created_at)}</span>
            {onTimeline && (
              <button
                type="button"
                onClick={onTimeline}
                className="inline-flex items-center gap-0.5 font-medium text-blue-600 hover:underline"
              >
                <Clock size={12} /> Timeline
              </button>
            )}
          </div>
        </div>

        {/* Middle — items & actions */}
        <div className="border-t border-dashed border-gray-200 p-4 lg:border-t-0" onClick={(e) => e.stopPropagation()}>
          <MerchantOrderItemsList
            items={(order.items ?? []) as unknown as Parameters<typeof MerchantOrderItemsList>[0]["items"]}
            requiresUtensils={order.requires_utensils}
            utensilsLabel={getUtensilsCustomerLabel(order)}
            compact
            className="border-b border-gray-100 pb-3"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Total Bill</span>
            <div className="flex items-center gap-2">
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">PAID</span>
              <span className="text-lg font-bold text-gray-900">₹{Number(total).toFixed(2)}</span>
            </div>
          </div>

          {isNew && onAccept && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={loading || acceptDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onAccept();
                }}
                className="flex-[2] rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {acceptLabel || 'Accept'}
              </button>
              {onReject && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject();
                  }}
                  className="flex-1 rounded-lg border-2 border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  Reject
                </button>
              )}
            </div>
          )}

          {isPreparing && (
            <div
              className={`mt-4 w-full ${prepExpired ? 'grid grid-cols-2 gap-2' : ''}`}
            >
              {prepExpired ? (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={onNeedMoreTime}
                    className="min-h-[44px] w-full rounded-xl border border-blue-600 bg-white px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    Need more time
                  </button>
                  <MarkAsReadyCountdownButton
                    order={order}
                    nowMs={nowMs}
                    disabled={loading}
                    fullWidth
                    className="min-h-[44px] w-full min-w-0 rounded-xl"
                    onClick={(e) => {
                      e.stopPropagation();
                      onReady();
                    }}
                  />
                </>
              ) : (
                <MarkAsReadyCountdownButton
                  order={order}
                  nowMs={nowMs}
                  disabled={loading}
                  fullWidth
                  className="min-h-[44px] w-full rounded-xl"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReady();
                  }}
                />
              )}
            </div>
          )}

          {isReady && (
            <div className="mt-4">
              <ReadyHandoverRunningTimeline order={order} nowMs={nowMs} />
            </div>
          )}

          {isPickedUp && (
            canMerchantMarkDelivered(order) && onComplete ? (
              <button
                type="button"
                disabled={loading}
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete();
                }}
                className="mt-4 w-full rounded-lg bg-green-600 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                Mark delivered
              </button>
            ) : (
              <p className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-center text-sm font-medium text-gray-600">
                Rider will complete delivery
              </p>
            )
          )}

          {isRto && (
            <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm font-medium text-orange-800">
              Return to origin in progress
            </p>
          )}
        </div>

        {/* Right — rider / delivery */}
        <div className="border-t border-dashed border-gray-200 p-4 lg:border-t-0" onClick={(e) => e.stopPropagation()}>
          {(isReady || isPickedUp) && (riderName || riderPhone) ? (
            <RiderDeliveryPartnerCard
              className="mb-3"
              riderName={riderName}
              riderPhone={riderPhone}
              riderSelfieUrl={order.rider_details?.selfie_url}
              variant={isPickedUp ? 'picked_up' : 'arrived'}
              pickupOtp={isReady ? order.pickup_otp : undefined}
              deliveryLabel={isPickedUp ? deliveryLabel ?? undefined : undefined}
              onCallRider={onCallRider}
              onTrackRider={onTrackRider}
              onUniformFeedback={isPickedUp ? onUniformFeedback : undefined}
              uniformFeedback={uniformFeedback}
            />
          ) : null}

          {(isReady || isPickedUp) && !riderName && !riderPhone && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-600">
              <Bike size={24} className="mx-auto mb-2 text-gray-400" />
              Assigning delivery partner…
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              <MessageCircle size={14} /> Live order chat support
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              <HelpCircle size={14} /> Order help
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
