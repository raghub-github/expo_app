'use client';

/**
 * Order bill print — Partner Site entry.
 * HTML template is owned by @gatimitra/bill-print (single source of truth).
 */

import React, { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import {
  buildBillHtml,
  formatOrderIdForPrint,
  formatOrderPlacedAt,
  formatOrderRs,
  merchantBillPartsFromItems,
  merchantItemCatalogAndNet,
  itemCookingNote,
  type BillLineItem,
  type BillPrintPayload,
  type BillStoreInfo,
} from '@gatimitra/bill-print';
import { printHtmlDocument } from '@gatimitra/print-utils';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import type { OrderPricingBreakdown } from '@/lib/orderLineItems';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import { formatOrderDropAddress } from '@/lib/formatOrderAddress';
import { isPartnerSelfPickupOrder } from '@/lib/partner-delivery-type';

export type GatiMitraPrintStoreInfo = BillStoreInfo;

function formatMoney(n: number) {
  return `₹${Math.round(Number(n))}`;
}

function mapBillItem(item: NormalizedOrderLineItem): BillLineItem {
  const special =
    (item as { specialInstructions?: string | null }).specialInstructions ??
    (item as { special_instructions?: string | null }).special_instructions ??
    null;
  return {
    name: item.name,
    quantity: item.quantity || 1,
    price: item.price,
    total: item.total,
    variantName: item.variantName ?? null,
    variantTag: item.variantTag ?? null,
    specialInstructions: special,
    customizationLines: (item.customizationLines ?? []).map((l) => ({
      kind: l.kind,
      name: l.name,
      amount: l.amount ?? null,
      quantity: null,
    })),
    customizations: item.customizations,
    customizationsTotal: item.customizationsTotal ?? null,
    baseAmount: item.baseAmount ?? null,
    capturedBaseAmount: item.capturedBaseAmount ?? null,
    capturedAddonAmount: item.capturedAddonAmount ?? null,
    hasCustomizations: item.hasCustomizations ?? null,
    catalogLineTotal: item.catalogLineTotal ?? null,
    netLineTotal: item.netLineTotal ?? null,
    offerDiscount: item.offerDiscount ?? null,
    offerLabel: item.offerLabel ?? null,
    isItemPromo: item.isItemPromo ?? null,
    appliedOfferType: item.appliedOfferType ?? null,
    ctmFromSnapshot: item.ctmFromSnapshot ?? null,
  };
}

export function orderToBillPayload(
  order: OrdersFoodRow,
  pricing: OrderPricingBreakdown,
  store: GatiMitraPrintStoreInfo
): BillPrintPayload {
  const items = (order.items ?? []) as NormalizedOrderLineItem[];
  return {
    formattedOrderId: order.formatted_order_id?.trim() || String(order.order_id),
    orderCreatedAt: order.created_at,
    taxInvoiceNumber: order.tax_invoice_number ?? null,
    customerName: order.customer_name?.trim() || null,
    dropAddress: formatOrderDropAddress(order.drop_address_normalized, order.drop_address_raw) || null,
    pickupOtp: isPartnerSelfPickupOrder(order) ? null : order.pickup_otp?.trim() || null,
    items: items.map(mapBillItem),
    pricing: {
      subtotal: pricing.subtotal,
      packaging: pricing.packaging,
      discount: pricing.discount,
      total: pricing.total,
    },
    store,
    printTimestamp: new Date().toISOString(),
  };
}

export function buildPrintHtml(
  order: OrdersFoodRow,
  pricing: OrderPricingBreakdown,
  store: GatiMitraPrintStoreInfo
): string {
  return buildBillHtml(orderToBillPayload(order, pricing, store));
}

export function printOrderBill(
  order: OrdersFoodRow | null | undefined,
  pricing: OrderPricingBreakdown,
  store: GatiMitraPrintStoreInfo | null | undefined
): void {
  if (typeof document === 'undefined' || !order || !store) return;
  printHtmlDocument(buildPrintHtml(order, pricing, store));
}

export type GatiMitraOrderPrintBillProps = {
  open: boolean;
  onClose: () => void;
  order: OrdersFoodRow | null;
  pricing: OrderPricingBreakdown;
  store: GatiMitraPrintStoreInfo | null;
};

export function GatiMitraOrderPrintBill({
  open,
  onClose,
  order,
  pricing,
  store,
}: GatiMitraOrderPrintBillProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const runPrint = useCallback(() => {
    printOrderBill(order, pricing, store);
  }, [order, pricing, store]);

  if (!open || !order || !store || typeof document === 'undefined') return null;

  const address = formatOrderDropAddress(order.drop_address_normalized, order.drop_address_raw);
  const items = (order.items ?? []) as NormalizedOrderLineItem[];
  const bill = merchantBillPartsFromItems(items.map(mapBillItem), pricing);

  return createPortal(
    <div className="fixed inset-0 z-[2600] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-bill-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 id="print-bill-title" className="text-lg font-bold text-gray-900">
            Print bill
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

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-gray-800 hide-scrollbar">
          <p className="text-xs text-violet-700 font-bold mb-2">GatiMitra — Restaurant Partner</p>
          <p className="text-xs text-gray-500 mb-1">GatiMitra order:</p>
          <p className="text-2xl font-extrabold tracking-tight mb-3">{formatOrderIdForPrint(order.formatted_order_id?.trim() || String(order.order_id))}</p>
          <p className="font-bold text-base">{store.storeName}</p>
          {store.cuisineLabel ? <p className="text-gray-600 text-xs">{store.cuisineLabel}</p> : null}
          {store.city ? <p className="text-gray-600 text-xs">{store.city}</p> : null}
          {store.fssaiNumber ? (
            <p className="text-gray-600 text-xs mt-1">FSSAI Lic. No. {store.fssaiNumber}</p>
          ) : null}
          <hr className="my-3 border-gray-200" />
          <p className="text-xs text-gray-600">{formatOrderPlacedAt(order.created_at)}</p>
          <p className="text-xs font-bold mt-1">PAID · Delivery by GatiMitra</p>
          {order.customer_name ? (
            <p className="mt-3">
              <span className="font-semibold">Name:</span> {order.customer_name}
            </p>
          ) : null}
          {address ? (
            <p className="mt-1 text-xs leading-relaxed">
              <span className="font-semibold">Address:</span> {address}
            </p>
          ) : null}
          {order.pickup_otp ? (
            <p className="mt-2">
              <span className="font-semibold">OTP:</span>{' '}
              <span className="text-xl font-extrabold">{order.pickup_otp}</span>
            </p>
          ) : null}
          <p className="text-center font-bold mt-4 mb-2">Summary</p>
          <ul className="space-y-2">
            {items.map((item, idx) => {
              const qty = item.quantity || 1;
              const { catalog, net, showStrike, offerBadge } = merchantItemCatalogAndNet(mapBillItem(item));
              const note = itemCookingNote(mapBillItem(item));
              return (
                <li key={idx} className="flex justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1">
                    {item.name}
                    {offerBadge ? (
                      <span className="mt-0.5 block text-[10px] font-bold text-amber-700">
                        {offerBadge}
                      </span>
                    ) : null}
                    {note ? (
                      <span className="mt-0.5 block text-[11px] font-semibold text-amber-800">
                        Cooking: {note}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {showStrike ? (
                      <>
                        <span className="mr-1 text-gray-400 line-through">{formatMoney(catalog)}</span>
                        {formatMoney(net)}
                      </>
                    ) : (
                      <>
                        {qty} x {item.price} · {formatMoney(net)}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 space-y-1 text-xs border-t border-gray-100 pt-3">
            {bill.packaging > 0.005 ? (
              <div className="flex justify-between">
                <span>Packaging</span>
                <span>{formatOrderRs(bill.packaging)}</span>
              </div>
            ) : null}
            {bill.discount > 0 ? (
              <div className="flex justify-between text-amber-700">
                <span>Discount</span>
                <span>−{formatOrderRs(bill.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-lg font-extrabold pt-1">
              <span>Total</span>
              <span>{formatOrderRs(bill.total)}</span>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={runPrint}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
