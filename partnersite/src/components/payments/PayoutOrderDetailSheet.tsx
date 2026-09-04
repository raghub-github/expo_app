'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import type { OrderPricingBreakdown } from '@/lib/orderLineItems';
import { OrderPanel } from '@/components/orders/OrderPanel';
import { OrderBillSidesheet } from '@/components/orders/OrderBillSidesheet';
import { OrderCustomerSidesheet } from '@/components/orders/OrderCustomerSidesheet';
import { OrderTimelineModal } from '@/components/orders/OrderTimelineModal';
import { GatiMitraOrderPrintBill } from '@/components/orders/GatiMitraOrderPrintBill';
import { RiderPhotoModal } from '@/components/orders/RiderPhotoModal';
import { OrderRiderTrackingModal } from '@/components/orders/OrderRiderTrackingModal';
import { OrderRidersHistorySidesheet, type RiderLogEntry } from '@/components/orders/OrderRidersHistorySidesheet';
import { orderHasAssignedRider } from '@/lib/order-has-assigned-rider';
import { resolveMerchantCtm } from '@/lib/merchant-order-ctm';
import { prefetchMerchantOrderTimelineBundle } from '@/lib/merchantTimelineEnrichmentCache';
import {
  fetchRidersLogCached,
  getCachedRidersLog,
  pastRidersFromLog,
  prefetchRidersLog,
} from '@/lib/ridersLogCache';
import type { MerchantStore } from '@/lib/merchantStore';

type PayoutOrderDetailSheetProps = {
  open: boolean;
  onClose: () => void;
  storeId: string;
  store: MerchantStore | null;
  ordersCoreId: number | null;
  ordersFoodId: number | null;
  formattedOrderId?: string | null;
  fallbackOrderId?: string | number | null;
};

function buildOrderPricing(order: OrdersFoodRow): OrderPricingBreakdown {
  const lineSum = (order.items ?? []).reduce(
    (acc, it) => acc + Number(it.total || (it.price || 0) * (it.quantity || 1)),
    0,
  );
  const p = order.pricing;
  if (p) return p;
  const total = resolveMerchantCtm(order);
  return {
    subtotal: lineSum,
    packaging: 0,
    taxes: 0,
    discount: 0,
    total: Number.isFinite(total) ? total : lineSum,
  };
}

export function PayoutOrderDetailSheet({
  open,
  onClose,
  storeId,
  store,
  ordersCoreId,
  ordersFoodId,
  formattedOrderId,
  fallbackOrderId,
}: PayoutOrderDetailSheetProps) {
  const [order, setOrder] = useState<OrdersFoodRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [billSheetOpen, setBillSheetOpen] = useState(false);
  const [billSheetAllItemsOnly, setBillSheetAllItemsOnly] = useState(false);
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [printBillOpen, setPrintBillOpen] = useState(false);
  const [riderTrackingOpen, setRiderTrackingOpen] = useState(false);
  const [riderImageModalUrl, setRiderImageModalUrl] = useState<string | null>(null);
  const [ridersLogModalOrderId, setRidersLogModalOrderId] = useState<number | null>(null);
  const [ridersLogModalOrderLabel, setRidersLogModalOrderLabel] = useState<string | null>(null);
  const [ridersLogList, setRidersLogList] = useState<RiderLogEntry[]>([]);
  const [ridersLogLoading, setRidersLogLoading] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!storeId || (!ordersCoreId && !ordersFoodId)) {
      setError('Order reference is missing.');
      setOrder(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ store_id: storeId });
      if (ordersCoreId) params.set('orders_core_id', String(ordersCoreId));
      else if (ordersFoodId) params.set('orders_food_id', String(ordersFoodId));

      const res = await fetch(`/api/food-orders?${params}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.orders) || data.orders.length === 0) {
        setError(data.error || 'Could not load order details.');
        setOrder(null);
        return;
      }
      const row = data.orders[0] as OrdersFoodRow;
      setOrder(row);
      prefetchMerchantOrderTimelineBundle(row.id, storeId);
      prefetchRidersLog(row.id);
    } catch {
      setError('Could not load order details.');
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [storeId, ordersCoreId, ordersFoodId]);

  useEffect(() => {
    if (!open) {
      setOrder(null);
      setError(null);
      setLoading(false);
      return;
    }
    void loadOrder();
  }, [open, loadOrder]);

  useEffect(() => {
    if (!open) {
      setBillSheetOpen(false);
      setBillSheetAllItemsOnly(false);
      setCustomerSheetOpen(false);
      setTimelineModalOpen(false);
      setPrintBillOpen(false);
      setRiderTrackingOpen(false);
      setRiderImageModalUrl(null);
      setRidersLogModalOrderId(null);
      setRidersLogModalOrderLabel(null);
    }
  }, [open]);

  useEffect(() => {
    if (ridersLogModalOrderId == null) {
      setRidersLogList([]);
      setRidersLogLoading(false);
      return;
    }
    const cached = getCachedRidersLog(ridersLogModalOrderId);
    if (cached) {
      setRidersLogList(pastRidersFromLog(cached.riders));
      setRidersLogLoading(false);
      void fetchRidersLogCached(ridersLogModalOrderId, { force: true }).then((data) => {
        setRidersLogList(pastRidersFromLog(data.riders));
      });
      return;
    }
    let cancelled = false;
    setRidersLogLoading(true);
    void fetchRidersLogCached(ridersLogModalOrderId).then((data) => {
      if (cancelled) return;
      setRidersLogList(pastRidersFromLog(data.riders));
      setRidersLogLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ridersLogModalOrderId]);

  const pricing = useMemo(() => (order ? buildOrderPricing(order) : null), [order]);
  const lineSum = useMemo(
    () =>
      order
        ? (order.items ?? []).reduce(
            (acc, it) => acc + Number(it.total || (it.price || 0) * (it.quantity || 1)),
            0,
          )
        : 0,
    [order],
  );

  if (!open) return null;

  const titleId =
    formattedOrderId?.trim() ||
    (fallbackOrderId != null ? String(fallbackOrderId) : 'Order details');

  return (
    <>
      <div className="fixed inset-0 z-[9999] flex">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
        <aside
          className="relative ml-auto w-full max-w-[min(100vw,520px)] h-full bg-white shadow-2xl flex flex-col overflow-hidden border-l border-gray-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payout-order-sheet-title"
        >
          <div className="flex-shrink-0 px-4 sm:px-5 py-3.5 border-b border-gray-200 bg-white flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="payout-order-sheet-title"
                className="text-base font-bold text-gray-900 leading-tight"
              >
                Order details
              </h2>
              <p className="text-sm font-semibold text-orange-600 mt-0.5 truncate">
                {titleId}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-600"
              aria-label="Close order details"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar bg-white">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                <p className="text-sm">Loading order…</p>
              </div>
            ) : error ? (
              <div className="m-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                <p className="font-semibold">Could not load order</p>
                <p className="mt-1">{error}</p>
                <button
                  type="button"
                  onClick={() => void loadOrder()}
                  className="mt-3 text-sm font-semibold text-red-700 underline"
                >
                  Try again
                </button>
              </div>
            ) : order && pricing ? (
              <OrderPanel
                className="w-full max-w-none border-0 shadow-none rounded-none"
                panelMode="history"
                panelLayout="stack"
                hideHeaderOrderId
                order={order}
                pricing={pricing}
                onOpenBill={() => {
                  setBillSheetAllItemsOnly(false);
                  setBillSheetOpen(true);
                }}
                onOpenCustomer={() => setCustomerSheetOpen(true)}
                onOpenAllItems={() => {
                  setBillSheetAllItemsOnly(true);
                  setBillSheetOpen(true);
                }}
                onOpenTimeline={() => {
                  prefetchMerchantOrderTimelineBundle(order.id, storeId);
                  setTimelineModalOpen(true);
                }}
                onPrintBill={() => setPrintBillOpen(true)}
                onViewPastRiders={() => {
                  prefetchRidersLog(order.id);
                  const hit = getCachedRidersLog(order.id);
                  if (hit) setRidersLogList(pastRidersFromLog(hit.riders));
                  setRidersLogModalOrderId(order.id);
                  setRidersLogModalOrderLabel(
                    order.formatted_order_id || `#${order.order_id}`,
                  );
                }}
                onTrackRider={() => setRiderTrackingOpen(true)}
                onOpenRiderPhoto={(url) => setRiderImageModalUrl(url)}
              />
            ) : null}
          </div>
        </aside>
      </div>

      <OrderBillSidesheet
        open={billSheetOpen && !!order}
        onClose={() => {
          setBillSheetOpen(false);
          setBillSheetAllItemsOnly(false);
        }}
        order={order}
        pricing={pricing ?? { subtotal: 0, packaging: 0, taxes: 0, discount: 0, total: 0 }}
        lineSum={lineSum}
        allItemsOnly={billSheetAllItemsOnly}
      />
      <OrderCustomerSidesheet
        open={customerSheetOpen && !!order}
        onClose={() => setCustomerSheetOpen(false)}
        order={order}
      />
      <GatiMitraOrderPrintBill
        open={printBillOpen && !!order}
        onClose={() => setPrintBillOpen(false)}
        order={order}
        pricing={pricing ?? { subtotal: 0, packaging: 0, taxes: 0, discount: 0, total: 0 }}
        store={
          store
            ? {
                storeName: store.store_name,
                city: store.city,
                cuisineLabel: store.cuisine_types?.[0] ?? null,
                fssaiNumber: store.fssai_number ?? null,
              }
            : null
        }
      />
      <OrderTimelineModal
        open={timelineModalOpen && !!order}
        onClose={() => setTimelineModalOpen(false)}
        order={order}
        storeId={storeId}
        layout="horizontal"
      />
      <OrderRiderTrackingModal
        open={riderTrackingOpen}
        preload={orderHasAssignedRider(order)}
        onClose={() => setRiderTrackingOpen(false)}
        order={order}
        merchantStoreLat={store?.latitude ?? null}
        merchantStoreLon={store?.longitude ?? null}
        merchantStoreName={store?.store_name ?? null}
      />
      <RiderPhotoModal
        open={!!riderImageModalUrl}
        imageUrl={riderImageModalUrl}
        riderName={order?.rider_details?.name ?? order?.rider_name ?? null}
        onClose={() => setRiderImageModalUrl(null)}
      />
      <OrderRidersHistorySidesheet
        open={ridersLogModalOrderId != null}
        orderLabel={ridersLogModalOrderLabel}
        riders={ridersLogList}
        loading={ridersLogLoading}
        allowCall={false}
        onClose={() => {
          setRidersLogModalOrderId(null);
          setRidersLogModalOrderLabel(null);
        }}
      />
    </>
  );
}
