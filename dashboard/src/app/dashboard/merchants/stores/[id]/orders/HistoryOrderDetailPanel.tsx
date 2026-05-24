'use client';

import React, { useState } from 'react';
import { Check, Printer, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/lib/types/food-orders';
import { normalizeOrderItems, type NormalizedOrderLineItem } from '@/lib/orderLineItems';
import {
  formatOrderRs,
  merchantBillPartsFromItems,
  merchantLineTotalForItem,
} from '@/lib/merchant-order-item-display';
import { historyBadgeClass, historyStatusLabel } from './orders-page-ui';
import { OrderHistoryItemDetailsModal } from '@/components/merchant/OrderHistoryItemDetailsModal';

function HistoryTimeline({ order }: { order: OrdersFoodRow }) {
  const steps = [
    { key: 'placed', label: 'Placed', done: !!order.created_at },
    { key: 'accepted', label: 'Accepted', done: !!order.accepted_at },
    {
      key: 'pickup',
      label: 'Estimated pickup',
      done: !!(order.prepared_at || order.dispatched_at),
    },
    { key: 'delivery', label: 'Estimated delivery', done: !!order.delivered_at },
  ];

  return (
    <div className="flex items-start justify-between gap-1 overflow-x-auto hide-scrollbar pb-1">
      {steps.map((step, i) => {
        const prevDone = i === 0 ? true : steps[i - 1].done;
        const lineGreen = i > 0 && prevDone;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div
                className={`shrink-0 flex-1 h-0.5 mt-3 min-w-[12px] max-w-[48px] ${lineGreen ? 'bg-green-500' : 'bg-gray-200'}`}
              />
            )}
            <div className="flex flex-col items-center shrink-0 w-[72px]">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${
                  step.done ? 'bg-green-500 border-green-500 text-white' : 'border-green-400 bg-white text-green-600'
                }`}
              >
                {step.done ? <Check size={14} strokeWidth={3} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
              </div>
              <span className="text-[9px] font-medium text-gray-600 mt-1 text-center leading-tight">{step.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export function HistoryOrderDetailPanel({
  order,
  onClose,
  storeId,
}: {
  order: OrdersFoodRow;
  onClose: () => void;
  storeId: string;
}) {
  const [itemDetailModal, setItemDetailModal] =
    useState<NormalizedOrderLineItem | null>(null);
  const lineItems = normalizeOrderItems(order.items ?? []);
  const pricing = order.pricing ?? {
    subtotal: 0,
    packaging: 0,
    taxes: 0,
    discount: 0,
    total: Number(order.food_items_total_value ?? 0),
  };
  const bill = merchantBillPartsFromItems(lineItems, pricing);

  const placedAgo = (() => {
    const mins = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minutes ago`;
    const h = Math.floor(mins / 60);
    return `${h} hour${h === 1 ? '' : 's'} ago`;
  })();

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none">
      <div className="border-b border-gray-200 px-4 py-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-gray-900">ID: {order.formatted_order_id || order.order_id}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${historyBadgeClass(order.order_status || '')}`}>
              {historyStatusLabel(order.order_status || '')}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {order.customer_name ? `Order by ${order.customer_name}` : 'Order details'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 print:hidden"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 mb-3">Order timeline</p>
        <HistoryTimeline order={order} />
        <p className="text-xs text-gray-500 mt-3">Placed {placedAgo}</p>
      </div>

      <div id="order-history-print" className="p-4">
        <div className="flex justify-end gap-2 mb-4 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-500 text-blue-600 text-xs font-semibold hover:bg-blue-50"
          >
            <Printer size={14} />
            ORDER
          </button>
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Order details</p>
          {lineItems.length === 0 ? (
            <p className="text-sm text-gray-500">No line items</p>
          ) : (
            <ul className="space-y-2.5">
              {lineItems.map((it, i) => (
                <li key={i} className="flex justify-between items-start gap-3 text-sm">
                  <p className="text-gray-800 min-w-0">
                    <span className="text-gray-600">{it.quantity} × </span>
                    <button
                      type="button"
                      onClick={() => setItemDetailModal(it)}
                      className="font-medium text-gray-900 border-b border-dashed border-gray-400 hover:border-gray-700 hover:text-gray-700 text-left"
                    >
                      {it.name}
                    </button>
                  </p>
                  <span className="font-medium text-gray-900 shrink-0 tabular-nums pt-0.5">
                    {formatOrderRs(merchantLineTotalForItem(it), 2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-200">
          <p className="text-xs font-extrabold tracking-wide text-gray-500 mb-2">TOTAL BILL</p>
          {bill.discount > 0 ? (
            <p className="text-xs text-emerald-700 mb-2">
              Restaurant discount −{formatOrderRs(bill.discount, 2)} included in total
            </p>
          ) : null}
          <div className="flex justify-between font-bold text-gray-900 text-sm">
            <span>Total</span>
            <span className="tabular-nums">{formatOrderRs(bill.total, 0)}</span>
          </div>
        </div>
      </div>

      <OrderHistoryItemDetailsModal
        open={itemDetailModal != null}
        onClose={() => setItemDetailModal(null)}
        lineItem={itemDetailModal}
        storeId={storeId}
      />
    </div>
  );
}
