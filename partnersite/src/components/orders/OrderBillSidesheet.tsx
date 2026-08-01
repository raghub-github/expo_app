'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import {
  normalizeOrderItems,
  type OrderPricingBreakdown,
  type NormalizedOrderLineItem,
} from '@/lib/orderLineItems';
import {
  formatOrderRs,
  merchantBillPartsFromItems,
  merchantItemCatalogAndNet,
  merchantItemLineParts,
  merchantLineTotalForItem,
  orderItemCookingNote,
  orderItemCustomizationRows,
  orderItemDisplayName,
  orderItemHasBreakdown,
} from '@/lib/merchant-order-item-display';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';

const AMOUNT_COL = 'w-full min-w-0 shrink-0 overflow-hidden text-right tabular-nums';

function VegMark({ vegNonveg }: { vegNonveg?: string | null }) {
  const t = (vegNonveg ?? '').toLowerCase();
  const isVeg = t.includes('veg') && !t.includes('non');
  const isNonVeg = t.includes('non') || t === 'non_veg';
  if (!isVeg && !isNonVeg) {
    return <span className="inline-block w-3 h-3 rounded border border-gray-300 shrink-0" aria-hidden />;
  }
  return (
    <span
      className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded border ${
        isVeg ? 'border-green-600' : 'border-red-600'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
    </span>
  );
}

function AmountCell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`${AMOUNT_COL} ${className}`.trim()}>{children}</span>;
}

function SummaryRow({
  label,
  amount,
  discount,
  bold,
}: {
  label: string;
  amount: number;
  discount?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[1fr_5.5rem] gap-x-2 ${discount ? 'text-emerald-700' : 'text-gray-700'} ${bold ? 'text-base font-bold text-gray-900' : ''}`}
    >
      <span>{label}</span>
      <span className={`${AMOUNT_COL} font-medium`}>
        {discount ? `−${formatOrderRs(amount, 2)}` : formatOrderRs(amount, 2)}
      </span>
    </div>
  );
}

function ItemRows({
  items,
  headerLabel,
}: {
  items: NormalizedOrderLineItem[];
  headerLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 py-2">No line items</p>;
  }

  const list = (
    <ul>
      {items.map((item, idx) => {
        const qty = Math.max(1, item.quantity || 1);
        const { catalog, net, showStrike, offerBadge, offerKind } = merchantItemCatalogAndNet(item);
        const displayName = orderItemDisplayName(item);
        const parts = merchantItemLineParts(item);
        const custRows = orderItemCustomizationRows(item);
        const cookingNote = orderItemCookingNote(item);
        const showValueSplit = orderItemHasBreakdown(item) && parts.hasCustomizations;
        return (
          <li
            key={idx}
            className={`px-2.5 py-2 text-sm ${idx < items.length - 1 ? 'border-b border-stone-100' : ''}`}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_48px_96px] items-center gap-x-2">
              <div className="flex min-w-0 items-start gap-2">
                <VegMark vegNonveg={item.vegNonveg} />
                <div className="min-w-0">
                  {offerBadge ? (
                    <span
                      className={`mb-0.5 inline-flex max-w-full items-center rounded-full px-1.5 py-px text-[9px] font-bold leading-tight tracking-wide ${
                        offerKind === "bogo"
                          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                          : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                      }`}
                    >
                      <span className="truncate">{offerBadge}</span>
                    </span>
                  ) : null}
                  <span className="block min-w-0 font-bold leading-snug text-gray-900">
                    {displayName}
                  </span>
                  {cookingNote ? (
                    <p className="mt-1 text-[11px] font-semibold leading-snug text-amber-800">
                      Cooking: {cookingNote}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="relative z-10 flex min-w-0 justify-center">
                <span className="incoming-num inline-flex h-7 min-w-8 items-center justify-center rounded border border-stone-300 bg-white px-1.5 text-[13px] font-semibold text-stone-900">
                  {qty}
                </span>
              </div>
              <AmountCell className="justify-self-end font-bold text-gray-900">
                {showStrike ? (
                  <span className="flex min-w-0 flex-col items-end leading-tight">
                    <span className="block max-w-full truncate text-[11px] font-medium text-gray-400 line-through">
                      {formatOrderRs(catalog, 2)}
                    </span>
                    <span className="block max-w-full truncate">{formatOrderRs(net, 2)}</span>
                  </span>
                ) : (
                  formatOrderRs(net, 2)
                )}
              </AmountCell>

              {showValueSplit ? (
                <>
                  <span className="pl-5 text-[11px] text-gray-600">Item value</span>
                  <span aria-hidden />
                  <AmountCell className="text-[11px] font-medium text-gray-800">
                    {formatOrderRs(parts.base, 2)}
                  </AmountCell>
                  <span className="pl-5 text-[11px] text-gray-600">Customization value</span>
                  <span aria-hidden />
                  <AmountCell className="text-[11px] font-medium text-teal-800">
                    {formatOrderRs(parts.customizations, 2)}
                  </AmountCell>
                </>
              ) : null}

              {custRows.map((row, j) => (
                <React.Fragment key={j}>
                  <span className="min-w-0 pl-5 text-[11px] leading-snug text-gray-600">
                    <span className="border-l border-teal-200 pl-2">↳ {row.label}</span>
                  </span>
                  <span aria-hidden />
                  {row.amount != null ? (
                    <AmountCell className="text-[11px] text-gray-700">
                      {formatOrderRs(row.amount, 2)}
                    </AmountCell>
                  ) : (
                    <span className={AMOUNT_COL} aria-hidden />
                  )}
                </React.Fragment>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-[minmax(0,1fr)_48px_96px] items-center gap-x-2 border-b border-stone-200 bg-stone-50 px-2.5 py-2 text-[10px] font-semibold text-stone-600">
        <span>{headerLabel}</span>
        <span className="text-center">QTY</span>
        <span className="text-right">Amount</span>
      </div>
      {list}
    </div>
  );
}

export type OrderBillSidesheetProps = {
  open: boolean;
  onClose: () => void;
  order: OrdersFoodRow | null;
  pricing: OrderPricingBreakdown;
  lineSum: number;
  allItemsOnly?: boolean;
};

export function OrderBillSidesheet({
  open,
  onClose,
  order,
  pricing,
  lineSum: _lineSum,
  allItemsOnly = false,
}: OrderBillSidesheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !order || typeof document === 'undefined') return null;

  const items = normalizeOrderItems(order.items);
  const bill = merchantBillPartsFromItems(items, pricing);
  const itemQtyCount = computeOrderItemQuantityCount(order);
  const title = allItemsOnly ? 'All items' : 'Bill details';

  return createPortal(
    <div className="fixed inset-0 z-[2400] flex justify-end" role="presentation">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-hidden
      />
      <aside
        className="relative flex h-dvh w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-bill-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id="order-bill-sheet-title" className="text-lg font-bold text-gray-900">
            {title}
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

        <div className="min-h-0 flex-1 overflow-y-auto hide-scrollbar px-5 py-4">
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Items ({itemQtyCount > 0 ? itemQtyCount : items.length})
            </p>
            <ItemRows
              items={items}
              headerLabel={allItemsOnly ? 'Items to be packed' : 'Item'}
            />
          </section>

          {!allItemsOnly ? (
            <section className="mt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Bill summary
              </p>
              <div className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/50 p-4 text-sm">
                <SummaryRow label="All items subtotal" amount={bill.itemsSubtotal} bold />
                {bill.packaging > 0 ? (
                  <SummaryRow label="Packaging charges" amount={bill.packaging} />
                ) : null}
                {bill.discount > 0 ? (
                  <SummaryRow label="Restaurant discount" amount={bill.discount} discount />
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Restaurant discount — none. Platform (GatiMitra) offers are not deducted from
                    your bill.
                  </p>
                )}
                <div className="space-y-1 border-t border-gray-200 pt-2.5">
                  <SummaryRow label="Total bill" amount={bill.total} bold />
                </div>
                <span className="inline-flex items-center rounded-md border border-teal-100 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
                  PAID
                </span>
              </div>
            </section>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <div className="grid grid-cols-[1fr_5.5rem] gap-x-2 items-center">
            <span className="text-base font-bold text-gray-900">Total bill</span>
            <span className={`${AMOUNT_COL} text-lg font-bold text-gray-900`}>
              {formatOrderRs(bill.total, 2)}
            </span>
          </div>
          {allItemsOnly ? (
            <p className="mt-1 text-[11px] text-gray-500">
              {bill.packaging > 0.005
                ? `Packaging ${formatOrderRs(bill.packaging, 2)} · `
                : ''}
              {bill.discount > 0 ? 'After restaurant discount' : 'Amount paid by customer'}
            </p>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body
  );
}
