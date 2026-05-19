'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';

function VegNonVegMark({ foodType }: { foodType?: string | null }) {
  const t = (foodType ?? '').toLowerCase();
  const isVeg = t.includes('veg') && !t.includes('non');
  const isNonVeg = t.includes('non') || t === 'non_veg' || t === 'non-veg';
  if (!isVeg && !isNonVeg) return null;
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
        isVeg ? 'border-green-600' : 'border-red-600'
      }`}
      aria-hidden
    >
      <span className={`h-2 w-2 rounded-full ${isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
    </span>
  );
}

export type OrderHistoryItemDetailsModalProps = {
  open: boolean;
  onClose: () => void;
  lineItem: NormalizedOrderLineItem | null;
  storeId: string | null;
};

type MenuDetail = {
  item_id: string;
  item_name: string;
  item_description: string | null;
  item_image_url: string | null;
  food_type: string | null;
  in_stock: boolean | null;
  selling_price: number | null;
  category_name: string | null;
  preparation_time_minutes: number | null;
  serves: number | null;
  spice_level: string | null;
};

export function OrderHistoryItemDetailsModal({
  open,
  onClose,
  lineItem,
  storeId,
}: OrderHistoryItemDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [menu, setMenu] = useState<MenuDetail | null>(null);
  const [outOfStock, setOutOfStock] = useState(false);
  const [stockSaving, setStockSaving] = useState(false);

  useEffect(() => {
    if (!open || !lineItem) {
      setMenu(null);
      return;
    }
    const menuItemId = lineItem.menuItemId;
    if (!storeId || menuItemId == null || !Number.isFinite(menuItemId)) {
      setMenu(null);
      setOutOfStock(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/merchant/order-line-item-menu?storeId=${encodeURIComponent(storeId)}&menuItemId=${menuItemId}`
        );
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.item) {
          setMenu(data.item as MenuDetail);
          setOutOfStock(data.item.in_stock === false);
        } else {
          setMenu(null);
        }
      } catch {
        if (!cancelled) setMenu(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, lineItem, storeId]);

  const displayName = menu?.item_name ?? lineItem?.name ?? 'Item';
  const displayPrice = lineItem?.price ?? menu?.selling_price ?? 0;
  const description =
    (menu?.item_description && menu.item_description.trim()) ||
    (lineItem?.description && lineItem.description.trim()) ||
    null;
  const imageUrl = menu?.item_image_url ?? lineItem?.imageUrl ?? null;
  const foodType = menu?.food_type ?? lineItem?.vegNonveg ?? null;

  const toggleStock = useCallback(async () => {
    if (!storeId || !menu?.item_id) {
      toast.message('Stock', { description: 'This item is not linked to your menu.' });
      return;
    }
    const nextOut = !outOfStock;
    setStockSaving(true);
    try {
      const res = await fetch('/api/merchant/menu-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          itemId: menu.item_id,
          in_stock: !nextOut,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error || 'Could not update stock');
        return;
      }
      setOutOfStock(nextOut);
      toast.success(nextOut ? 'Marked out of stock' : 'Marked in stock');
    } catch {
      toast.error('Could not update stock');
    } finally {
      setStockSaving(false);
    }
  }, [storeId, menu?.item_id, outOfStock]);

  if (!open || !lineItem || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2500] flex items-start justify-center overflow-y-auto hide-scrollbar px-4 pb-6 pt-20 sm:pt-24"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md max-h-[min(32rem,calc(100vh-7rem))] sm:max-h-[min(36rem,calc(100vh-8rem))] my-auto overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col shrink-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-item-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 id="order-item-detail-title" className="text-lg font-semibold text-gray-900">
            Item details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto min-h-0 flex-1 hide-scrollbar">
          <div className="relative w-full aspect-[16/10] bg-gray-100">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="animate-spin text-gray-400" size={28} />
              </div>
            )}
            {!loading && imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : !loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                No image
              </div>
            ) : null}
          </div>

          <div className="px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <VegNonVegMark foodType={foodType} />
                <div className="min-w-0">
                  <p className="text-base font-semibold text-gray-900 leading-snug">{displayName}</p>
                  {lineItem.variantName && (
                    <p className="text-xs text-gray-500 mt-0.5">Variant: {lineItem.variantName}</p>
                  )}
                  {lineItem.categoryName && (
                    <p className="text-xs text-gray-500 mt-0.5">{lineItem.categoryName}</p>
                  )}
                </div>
              </div>
              <span className="text-base font-semibold text-gray-900 shrink-0 tabular-nums">
                ₹{displayPrice.toFixed(0)}
              </span>
            </div>

            <p className={`mt-3 text-sm ${description ? 'text-gray-600' : 'text-rose-400'}`}>
              {description || 'No description added'}
            </p>

            {lineItem.customizations && lineItem.customizations.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Add-ons / customizations
                </p>
                <ul className="text-sm text-gray-700 space-y-1">
                  {lineItem.customizations.map((c, i) => (
                    <li key={i}>• {c}</li>
                  ))}
                </ul>
              </div>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm border-t border-gray-100 pt-4">
              <div>
                <dt className="text-gray-500 text-xs">Quantity</dt>
                <dd className="font-medium text-gray-900">{lineItem.quantity}</dd>
              </div>
              <div>
                <dt className="text-gray-500 text-xs">Line total</dt>
                <dd className="font-medium text-gray-900 tabular-nums">₹{lineItem.total.toFixed(2)}</dd>
              </div>
              {menu?.preparation_time_minutes != null && (
                <div>
                  <dt className="text-gray-500 text-xs">Prep time</dt>
                  <dd className="font-medium text-gray-900">{menu.preparation_time_minutes} min</dd>
                </div>
              )}
              {menu?.serves != null && (
                <div>
                  <dt className="text-gray-500 text-xs">Serves</dt>
                  <dd className="font-medium text-gray-900">{menu.serves}</dd>
                </div>
              )}
              {menu?.spice_level && (
                <div>
                  <dt className="text-gray-500 text-xs">Spice</dt>
                  <dd className="font-medium text-gray-900 capitalize">{menu.spice_level}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {menu?.item_id && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3 shrink-0 bg-white">
            <span className="text-sm text-gray-800">Item out of stock</span>
            <button
              type="button"
              role="switch"
              aria-checked={outOfStock}
              disabled={stockSaving}
              onClick={toggleStock}
              className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${
                outOfStock ? 'bg-gray-800' : 'bg-gray-300'
              } ${stockSaving ? 'opacity-60' : ''}`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-1 ${
                  outOfStock ? 'translate-x-6 ml-0.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
