'use client';

import React from 'react';
import { MapPin, Minus, Plus, UtensilsCrossed, Volume2, VolumeX, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/lib/types/food-orders';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';
import {
  clampPrepMinutes,
  PREP_TIME_MAX,
  PREP_TIME_MIN,
} from '@/lib/order-prep-time';

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

function vegDotClass(veg?: string | null) {
  const v = String(veg || '').toLowerCase();
  if (v.includes('non')) return 'bg-red-600';
  if (v === 'veg') return 'bg-green-600';
  return 'bg-gray-400';
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
  actionLoading: boolean;
  acceptLabel?: string;
  acceptDisabled?: boolean;
}) {
  const pricing = order.pricing;
  const itemCount = computeOrderItemQuantityCount(order);
  const subtotal =
    pricing?.subtotal ??
    (order.items?.reduce((s, it) => s + Number(it.total || 0), 0) || Number(order.food_items_total_value || 0));
  const total = pricing?.total ?? Number(order.food_items_total_value || 0);

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
        {order.requires_utensils && (
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-green-700">
            <UtensilsCrossed size={16} />
            Send cutlery
          </div>
        )}
        {order.delivery_instructions && !order.requires_utensils && (
          <div className="mb-3 flex items-start gap-2 text-sm text-gray-700">
            <MapPin size={14} className="mt-0.5 shrink-0 text-amber-600" />
            {order.delivery_instructions}
          </div>
        )}

        <div className="space-y-3 border-b border-gray-100 pb-3">
          {order.items && order.items.length > 0 ? (
            order.items.map((item, idx) => {
              const qty = item.quantity || 1;
              const amount = Number(item.total || Number(item.price || 0) * qty);
              return (
                <div key={idx} className="flex items-start justify-between gap-2 text-sm">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-sm ${vegDotClass(item.vegNonveg)}`} />
                    <span className="font-medium text-gray-900">
                      {qty} × {item.name || `Item ${idx + 1}`}
                    </span>
                  </div>
                  <span className="shrink-0 font-medium">₹{amount.toFixed(2)}</span>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-gray-600">
              {itemCount} item{itemCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="space-y-1.5 py-3 text-sm text-gray-700">
          <div className="flex justify-between">
            <span>
              Subtotal ({itemCount} item{itemCount !== 1 ? 's' : ''})
            </span>
            <span>₹{Number(subtotal).toFixed(2)}</span>
          </div>
          {(pricing?.packaging ?? 0) > 0 && (
            <div className="flex justify-between">
              <span>Restaurant packaging charges</span>
              <span>₹{Number(pricing?.packaging).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Taxes</span>
            <span>₹{Number(pricing?.taxes ?? 0).toFixed(2)}</span>
          </div>
          {(pricing?.discount ?? 0) > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Discount</span>
              <span>-₹{Number(pricing?.discount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-gray-100 pt-2 font-bold text-gray-900">
            <span>Total bill</span>
            <div className="flex items-center gap-2">
              <span>₹{Number(total).toFixed(2)}</span>
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">PAID</span>
            </div>
          </div>
        </div>

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
