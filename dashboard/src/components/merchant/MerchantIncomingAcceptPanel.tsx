'use client';

import React, { useMemo } from 'react';
import { MapPin, Minus, Plus, UtensilsCrossed, Volume2, VolumeX, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/lib/types/food-orders';
import {
  clampPrepMinutes,
  PREP_TIME_MAX,
  PREP_TIME_MIN,
} from '@/lib/order-prep-time';
import { MerchantOrderItemsList } from '@/components/orders/MerchantOrderItemsList';
import { MerchantOrderBillSummary } from '@/components/orders/MerchantOrderBillSummary';
import { getUtensilsCustomerLabel } from '@/lib/orderUtensilsLabel';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';

const MAX_PREVIEW_ITEMS = 3;

export function OrderPrepTimeStepper({
  minutes,
  onChange,
  disabled,
}: {
  minutes: number;
  onChange: (m: number) => void;
  disabled?: boolean;
}) {
  const safe = clampPrepMinutes(minutes);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-800">Set food preparation time</p>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
        <button
          type="button"
          disabled={disabled || safe <= PREP_TIME_MIN}
          onClick={() => onChange(clampPrepMinutes(safe - 1))}
          className="flex w-14 shrink-0 items-center justify-center border-r border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
          aria-label="Decrease preparation time"
        >
          <Minus size={20} />
        </button>
        <div className="flex flex-1 items-center justify-center py-3 text-lg font-bold text-gray-900">
          {safe} mins
        </div>
        <button
          type="button"
          disabled={disabled || safe >= PREP_TIME_MAX}
          onClick={() => onChange(clampPrepMinutes(safe + 1))}
          className="flex w-14 shrink-0 items-center justify-center border-l border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
          aria-label="Increase preparation time"
        >
          <Plus size={20} />
        </button>
      </div>
    </div>
  );
}

/** Zomato-style incoming accept modal. */
export function MerchantIncomingAcceptPanel({
  order,
  prepMinutes,
  onPrepMinutesChange,
  storeDefaultPrepMinutes,
  soundMuted,
  onMuteToggle,
  onClose,
  onAccept,
  onReject,
  onViewAllItems,
  actionLoading,
  acceptLabel,
  acceptDisabled,
}: {
  order: OrdersFoodRow;
  prepMinutes: number;
  onPrepMinutesChange: (m: number) => void;
  storeDefaultPrepMinutes?: number;
  soundMuted?: boolean;
  onMuteToggle?: () => void;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onViewAllItems?: () => void;
  actionLoading: boolean;
  acceptLabel?: string;
  acceptDisabled?: boolean;
}) {
  const pricing = order.pricing ?? {
    subtotal: 0,
    packaging: 0,
    taxes: 0,
    discount: 0,
    total: Number(order.food_items_total_value || 0),
  };
  const orderItems = useMemo(
    () => (Array.isArray(order.items) ? order.items : []) as NormalizedOrderLineItem[],
    [order.items]
  );
  const itemCount = useMemo(() => computeOrderItemQuantityCount(order), [order]);
  const moreItemsCount = Math.max(0, orderItems.length - MAX_PREVIEW_ITEMS);
  const utensilsLabel = getUtensilsCustomerLabel(order);
  const sendCutlery =
    order.requires_utensils === true ||
    (utensilsLabel != null && !/don'?t send/i.test(utensilsLabel));

  return (
    <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 id="merchant-incoming-title" className="text-lg font-bold text-gray-900">
          1 new order
        </h2>
        <div className="flex items-center gap-1">
          {onMuteToggle && (
            <button
              type="button"
              onClick={onMuteToggle}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              {soundMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              {soundMuted ? 'Unmute' : 'Mute'}
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-gray-100" aria-label="Close">
            <X size={20} className="text-gray-500" />
          </button>
        </div>
      </div>

      <div className="bg-violet-700 px-4 py-1.5 text-center text-[11px] font-bold tracking-widest text-white">
        GATIMITRA DELIVERY
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {order.delivery_instructions && !order.requires_utensils && (
          <div className="mb-3 flex items-start gap-2 text-sm text-gray-700">
            <MapPin size={14} className="mt-0.5 shrink-0 text-amber-600" />
            {order.delivery_instructions}
          </div>
        )}

        <div className="mb-3 flex gap-2">
          <div
            className={`flex w-1/2 min-w-0 items-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] font-semibold leading-tight ${
              sendCutlery
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-gray-200 bg-gray-50 text-gray-600'
            }`}
          >
            <UtensilsCrossed
              size={14}
              className={`shrink-0 ${sendCutlery ? 'text-emerald-600' : 'text-gray-500'}`}
              aria-hidden
            />
            <span className="min-w-0 truncate">
              {utensilsLabel ?? (sendCutlery ? 'Send cutlery & utensils' : "Don't send cutlery")}
            </span>
          </div>
          <div className="flex w-1/2 min-w-0 items-center justify-end gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-2 text-[11px] text-gray-800">
            <span className="font-semibold tabular-nums">Total items – {itemCount}</span>
            {orderItems.length > 0 && onViewAllItems ? (
              <button
                type="button"
                onClick={onViewAllItems}
                className="shrink-0 font-bold text-blue-600 hover:underline"
              >
                View all
              </button>
            ) : null}
          </div>
        </div>

        <MerchantOrderItemsList
          items={orderItems}
          requiresUtensils={false}
          maxItems={MAX_PREVIEW_ITEMS}
          compact
          className="border-b border-gray-100 pb-3"
        />
        {moreItemsCount > 0 && onViewAllItems ? (
          <button
            type="button"
            className="mb-3 w-full text-center text-xs font-bold text-blue-600 hover:underline"
            onClick={onViewAllItems}
          >
            +{moreItemsCount} more in list — View all
          </button>
        ) : null}

        <MerchantOrderBillSummary
          className="py-3"
          items={orderItems}
          pricing={pricing}
        />

        <OrderPrepTimeStepper minutes={prepMinutes} onChange={onPrepMinutesChange} disabled={actionLoading} />
        {storeDefaultPrepMinutes != null && prepMinutes !== storeDefaultPrepMinutes && (
          <p className="mt-2 text-center text-[11px] text-gray-500">
            Store default: {storeDefaultPrepMinutes} min
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-3 border-t border-gray-100 p-4">
        <button
          type="button"
          onClick={onReject}
          disabled={actionLoading}
          className="flex-1 rounded-xl border-2 border-red-500 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={actionLoading || acceptDisabled}
          className="flex-[2] rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {acceptLabel || 'Accept order'}
        </button>
      </div>
    </div>
  );
}
