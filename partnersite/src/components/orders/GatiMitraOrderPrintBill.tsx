'use client';

import React, { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import type { OrderPricingBreakdown } from '@/lib/orderLineItems';
import { formatOrderDropAddress } from '@/lib/formatOrderAddress';
import { getUtensilsCustomerLabel } from '@/lib/orderUtensilsLabel';

export type GatiMitraPrintStoreInfo = {
  storeName: string;
  city?: string | null;
  cuisineLabel?: string | null;
  fssaiNumber?: string | null;
};

function formatMoney(n: number) {
  return `₹${Math.round(Number(n))}`;
}

function formatOrderPlacedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return iso;
  }
}

function formatOrderIdForPrint(order: OrdersFoodRow): string {
  const raw = order.formatted_order_id?.trim() || String(order.order_id);
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10) {
    const mid = Math.ceil(digits.length / 2);
    return `${digits.slice(0, mid)} ${digits.slice(mid)}`;
  }
  return raw.startsWith('#') ? raw.slice(1) : raw;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintHtml(
  order: OrdersFoodRow,
  pricing: OrderPricingBreakdown,
  store: GatiMitraPrintStoreInfo
): string {
  const items = order.items ?? [];
  const address = formatOrderDropAddress(order.drop_address_normalized, order.drop_address_raw);
  const utensils = getUtensilsCustomerLabel(order);
  const instructions = order.delivery_instructions?.trim();
  const otp = order.pickup_otp?.trim();

  const itemRows = items
    .map((item) => {
      const qty = item.quantity || 1;
      const unit = Number(item.price || 0);
      const amount = Number(item.total || unit * qty);
      return `<tr>
          <td class="item-name">${escapeHtml(item.name)}</td>
          <td class="item-qty">${qty} x ${unit}</td>
          <td class="item-amt">${formatMoney(amount)}</td>
        </tr>`;
    })
    .join('');

  const notes: string[] = [];
  if (utensils) notes.push(`<p class="note">${escapeHtml(utensils)}</p>`);
  if (instructions) notes.push(`<p class="note">${escapeHtml(instructions)}</p>`);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GatiMitra order ${escapeHtml(formatOrderIdForPrint(order))}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 16px 20px; font-size: 13px; line-height: 1.45; }
    .brand { font-size: 11px; color: #444; margin-bottom: 4px; }
    h1 { font-size: 15px; font-weight: 700; margin: 0 0 8px; }
    .order-id { font-size: 28px; font-weight: 800; letter-spacing: 0.02em; margin: 0 0 12px; }
    .store { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
    .muted { color: #555; font-size: 12px; margin: 0 0 2px; }
    .divider { border-top: 1px solid #ccc; margin: 12px 0; }
    .meta-row { font-size: 12px; margin-bottom: 4px; }
    .paid { font-weight: 800; font-size: 13px; }
    .section-title { text-align: center; font-weight: 800; font-size: 14px; margin: 12px 0 8px; }
    table { width: 100%; border-collapse: collapse; }
    .item-name { text-align: left; padding: 4px 8px 4px 0; vertical-align: top; }
    .item-qty { text-align: center; white-space: nowrap; padding: 4px; color: #333; }
    .item-amt { text-align: right; white-space: nowrap; padding: 4px 0 4px 8px; font-weight: 600; }
    .summary { margin-top: 10px; font-size: 13px; }
    .summary div { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .summary .discount { color: #b45309; }
    .total-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: 8px; font-size: 22px; font-weight: 800; }
    .otp { font-size: 22px; font-weight: 800; }
    .note { margin: 8px 0 0; font-size: 12px; }
    .footer { margin-top: 20px; font-size: 11px; color: #666; text-align: center; }
    @media print { body { padding: 8px 12px; } }
  </style>
</head>
<body>
  <p class="brand">GatiMitra — Restaurant Partner</p>
  <h1>GatiMitra order:</h1>
  <p class="order-id">${escapeHtml(formatOrderIdForPrint(order))}</p>
  <p class="store">${escapeHtml(store.storeName)}</p>
  ${store.cuisineLabel ? `<p class="muted">${escapeHtml(store.cuisineLabel)}</p>` : ''}
  ${store.city ? `<p class="muted">${escapeHtml(store.city)}</p>` : ''}
  ${store.fssaiNumber ? `<p class="muted">FSSAI Lic. No. ${escapeHtml(store.fssaiNumber)}</p>` : ''}
  <div class="divider"></div>
  <p class="meta-row">${escapeHtml(formatOrderPlacedAt(order.created_at))}</p>
  <p class="meta-row paid">PAID</p>
  <p class="meta-row">Delivery by GatiMitra</p>
  <div class="divider"></div>
  ${order.customer_name ? `<p><strong>Name:</strong> ${escapeHtml(order.customer_name)}</p>` : ''}
  ${address ? `<p><strong>Address:</strong> ${escapeHtml(address.toUpperCase())}</p>` : ''}
  ${otp ? `<p><strong>OTP:</strong> <span class="otp">${escapeHtml(otp)}</span></p>` : ''}
  <div class="divider"></div>
  <p class="section-title">Summary</p>
  <table><tbody>${itemRows || '<tr><td colspan="3">No items</td></tr>'}</tbody></table>
  <div class="summary">
    ${pricing.packaging > 0 ? `<div><span>Restaurant Packaging Charges</span><span>${formatMoney(pricing.packaging)}</span></div>` : ''}
    <div><span>Taxes</span><span>${formatMoney(pricing.taxes)}</span></div>
    ${pricing.discount > 0 ? `<div class="discount"><span>Discount</span><span>−${formatMoney(pricing.discount)}</span></div>` : ''}
  </div>
  <div class="total-row"><span>Total</span><span>${formatMoney(pricing.total)}</span></div>
  ${notes.join('')}
  <p class="footer">Powered by GatiMitra</p>
</body>
</html>`;
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
    if (!order || !store) return;
    const html = buildPrintHtml(order, pricing, store);

    const win = window.open('', '_blank', 'noopener,noreferrer,width=480,height=720');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => {
      try {
        win.print();
      } catch {
        /* ignore */
      }
    }, 350);
  }, [order, pricing, store]);

  if (!open || !order || !store || typeof document === 'undefined') return null;

  const address = formatOrderDropAddress(order.drop_address_normalized, order.drop_address_raw);
  const items = order.items ?? [];

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
          <p className="text-2xl font-extrabold tracking-tight mb-3">{formatOrderIdForPrint(order)}</p>
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
              const amount = Number(item.total || (item.price || 0) * qty);
              return (
                <li key={idx} className="flex justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1">{item.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {qty} x {item.price} · {formatMoney(amount)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 space-y-1 text-xs border-t border-gray-100 pt-3">
            {pricing.packaging > 0 ? (
              <div className="flex justify-between">
                <span>Packaging</span>
                <span>{formatMoney(pricing.packaging)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span>Taxes</span>
              <span>{formatMoney(pricing.taxes)}</span>
            </div>
            {pricing.discount > 0 ? (
              <div className="flex justify-between text-amber-700">
                <span>Discount</span>
                <span>−{formatMoney(pricing.discount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-lg font-extrabold pt-1">
              <span>Total</span>
              <span>{formatMoney(pricing.total)}</span>
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
