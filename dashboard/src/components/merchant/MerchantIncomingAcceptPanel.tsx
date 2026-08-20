'use client';

import React, { useMemo } from 'react';
import { Clock, MapPin, Minus, Plus, StickyNote, Volume2, VolumeX, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/lib/types/food-orders';
import {
  clampPrepMinutes,
  PREP_TIME_MAX,
  PREP_TIME_MIN,
} from '@/lib/order-prep-time';
import { MerchantOrderItemsList } from '@/components/orders/MerchantOrderItemsList';
import { MerchantOrderBillSummary } from '@/components/orders/MerchantOrderBillSummary';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';
import { parseMerchantInstructionsList } from '@/lib/merchant-order-instructions';
import { FormattedOrderId } from '@/components/FormattedOrderId';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import { merchantBillPartsFromItems } from '@/lib/merchant-order-item-display';

const MAX_PREVIEW_ITEMS = 3;
const PREP_STEP_MINUTES = 5;

function formatCustomerOrderOrdinal(
  ordinal: number | null | undefined,
  storeOrdersTotal: number | null | undefined
): string | null {
  const raw = [ordinal, storeOrdersTotal]
    .map((v) => Math.floor(Number(v)))
    .find((v) => Number.isFinite(v) && v > 0);
  if (raw == null) return null;
  const mod100 = raw % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${raw}th`;
  switch (raw % 10) {
    case 1:
      return `${raw}st`;
    case 2:
      return `${raw}nd`;
    case 3:
      return `${raw}rd`;
    default:
      return `${raw}th`;
  }
}

export function OrderPrepTimeStepper({
  minutes,
  onChange,
  disabled,
  maxMinutes = PREP_TIME_MAX,
}: {
  minutes: number;
  onChange: (m: number) => void;
  disabled?: boolean;
  maxMinutes?: number;
}) {
  const cap = Math.max(PREP_TIME_MIN, Math.min(PREP_TIME_MAX, maxMinutes));
  const safe = Math.min(cap, clampPrepMinutes(minutes));
  return (
    <div className="flex w-1/2 items-center gap-2 rounded-xl bg-stone-50 px-2.5 py-2 ring-1 ring-stone-200/80">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold leading-tight text-stone-900">Preparation time</p>
        <p className="mt-0.5 text-[9px] font-medium leading-tight text-stone-500">
          {PREP_TIME_MIN}–{cap} min
        </p>
      </div>
      <div className="flex shrink-0 items-stretch overflow-hidden rounded-lg bg-white ring-1 ring-stone-200">
        <button
          type="button"
          className="flex h-8 w-7 items-center justify-center border-r border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
          disabled={safe <= PREP_TIME_MIN || disabled}
          onClick={() => onChange(clampPrepMinutes(safe - PREP_STEP_MINUTES))}
          aria-label="Decrease preparation time"
        >
          <Minus size={14} />
        </button>
        <div className="flex h-8 min-w-[2.75rem] items-center justify-center px-1.5 text-center text-[12px] font-bold tabular-nums text-stone-900">
          {safe}m
        </div>
        <button
          type="button"
          className="flex h-8 w-7 items-center justify-center border-l border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
          disabled={safe >= cap || disabled}
          onClick={() => onChange(clampPrepMinutes(Math.min(cap, safe + PREP_STEP_MINUTES)))}
          aria-label="Increase preparation time"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/** Incoming accept modal — partnersite PartnerIncomingOrderModal layout. */
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
  onViewBill,
  actionLoading,
  acceptLabel,
  acceptDisabled,
  acceptProgressPct = 0,
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
  onViewBill?: () => void;
  actionLoading: boolean;
  acceptLabel?: string;
  acceptDisabled?: boolean;
  acceptProgressPct?: number;
}) {
  const orderItems = useMemo(
    () => (Array.isArray(order.items) ? order.items : []) as NormalizedOrderLineItem[],
    [order.items]
  );
  const pricing = useMemo(() => {
    const precision = Math.max(0, Number(order.merchant_precision_discount) || 0);
    const packaging = Number(order.pricing?.packaging) || 0;
    const bill = merchantBillPartsFromItems(orderItems, {
      subtotal: 0,
      packaging,
      discount: precision,
      total: 0,
    });
    if (bill.total > 0.005) {
      return {
        subtotal: bill.itemsSubtotal,
        packaging: bill.packaging,
        taxes: 0,
        discount: bill.discount,
        total: bill.total,
      };
    }
    return (
      order.pricing ?? {
        subtotal: 0,
        packaging: 0,
        taxes: 0,
        discount: 0,
        total: Number(order.food_items_total_value || order.total_ctm || 0),
      }
    );
  }, [order, orderItems]);
  const itemCount = useMemo(() => computeOrderItemQuantityCount(order), [order]);
  const moreItemsCount = Math.max(0, orderItems.length - MAX_PREVIEW_ITEMS);
  const kitchenNotes = useMemo(
    () => parseMerchantInstructionsList(order.merchant_instructions_list).filter(Boolean),
    [order.merchant_instructions_list]
  );
  const isBig = order.is_bulk_order === true;
  const orderPlacedLabel = useMemo(() => {
    if (!order.created_at) return '';
    try {
      return new Date(order.created_at).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  }, [order.created_at]);
  const ordinal = formatCustomerOrderOrdinal(
    order.customer_store_order_ordinal,
    order.customer_order_count
  );

  return (
    <div className="relative flex max-h-[min(88dvh,calc(100dvh-5rem))] w-full min-h-0 flex-col overflow-hidden rounded-t-[1.25rem] bg-[#fafaf9] shadow-[0_24px_64px_rgba(28,25,23,0.28)] ring-1 ring-stone-900/10 sm:max-h-[min(85dvh,calc(100dvh-6rem))] sm:rounded-[1.25rem]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200/80 bg-white px-4 py-2.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="merchant-incoming-title" className="text-[15px] font-semibold tracking-tight text-stone-900">
            1 new order
          </h2>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            GatiMitra delivery
            {order.order_type ? ` · ${String(order.order_type).replace(/_/g, ' ')}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-0.5">
            {onMuteToggle ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-100"
                onClick={onMuteToggle}
                aria-label={soundMuted ? 'Unmute' : 'Mute'}
              >
                {soundMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                {soundMuted ? 'Unmute' : 'Mute'}
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
          {orderPlacedLabel ? (
            <p className="max-w-[11rem] text-right text-[10px] font-semibold leading-snug text-stone-500">
              {orderPlacedLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-2.5 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <FormattedOrderId
            formattedOrderId={order.formatted_order_id}
            fallbackOrderId={order.order_id}
            size="lg"
          />
          {kitchenNotes.length > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-800 ring-1 ring-violet-300">
              <StickyNote size={12} aria-hidden />
              <span className="tabular-nums">{kitchenNotes.length}</span>
              <span>Customer note added</span>
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-[13px] leading-snug text-stone-700">
          {order.customer_name ? (
            <span className="font-medium text-stone-900">
              {ordinal ? `${ordinal} order by ${order.customer_name}` : `Order by ${order.customer_name}`}
            </span>
          ) : (
            <span className="font-medium text-stone-900">New customer order</span>
          )}
        </p>

        {order.delivery_instructions ? (
          <div className="mt-2 flex items-start gap-1.5 text-[12px] text-stone-600">
            <MapPin size={12} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
            <span>{order.delivery_instructions}</span>
          </div>
        ) : null}

        {isBig ? (
          <div className="mt-2 flex gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 ring-1 ring-amber-200/80">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            <div>
              <p className="text-[12px] font-semibold text-amber-950">Big order</p>
              <p className="text-[11px] leading-snug text-amber-900/85">
                Allow extra prep time before you accept.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-2 mb-2 pb-1">
          <MerchantOrderItemsList
            items={orderItems}
            totalItemCount={itemCount}
            totalLineCount={orderItems.length}
            requiresUtensils={false}
            maxItems={MAX_PREVIEW_ITEMS}
            compact
            hideMoreHint
            showUtensilsBanner={false}
            showQuantityColumn
            showOrderItemsHeader
            onViewMore={
              moreItemsCount > 0
                ? onViewAllItems
                : undefined
            }
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-stone-200/80 bg-white">
        <div className="space-y-2 px-4 pt-2.5 sm:px-5">
          <MerchantOrderBillSummary
            compact
            items={orderItems}
            pricing={pricing}
            discountLabel="Merchant Precision Discount"
            onTotalClick={onViewBill}
          />

          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={onViewAllItems}
              disabled={orderItems.length === 0}
              className="flex w-1/2 items-center justify-center rounded-xl bg-blue-50 px-2 py-2 text-center text-[12px] font-bold leading-tight text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 disabled:opacity-40"
            >
              View all items
              {itemCount > 0 ? (
                <span className="ml-1 font-extrabold tabular-nums">({itemCount})</span>
              ) : null}
            </button>
            <OrderPrepTimeStepper
              minutes={prepMinutes}
              onChange={onPrepMinutesChange}
              disabled={actionLoading}
              maxMinutes={storeDefaultPrepMinutes != null ? Math.max(storeDefaultPrepMinutes, PREP_TIME_MAX) : PREP_TIME_MAX}
            />
          </div>
        </div>

        <div className="mt-2 flex gap-2 px-4 pb-3 pt-1.5 sm:px-5">
          <button
            type="button"
            disabled={actionLoading}
            className="flex-1 rounded-xl border border-red-300 bg-white py-2.5 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            onClick={onReject}
          >
            Reject
          </button>
          <button
            type="button"
            disabled={actionLoading || acceptDisabled}
            className="relative flex-[1.45] overflow-hidden rounded-xl bg-emerald-600 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-emerald-900/15 hover:bg-emerald-700 disabled:opacity-50"
            onClick={onAccept}
          >
            <span
              className="absolute inset-y-0 left-0 bg-orange-500/40 transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.min(100, Math.max(0, acceptProgressPct))}%` }}
              aria-hidden
            />
            <span className="relative tabular-nums">{acceptLabel || 'Accept order'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
