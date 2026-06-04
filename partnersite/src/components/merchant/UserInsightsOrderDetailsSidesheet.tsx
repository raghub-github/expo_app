"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  User,
  MapPin,
  Bike,
  Loader2,
  UtensilsCrossed,
  Package,
  AlertCircle,
} from "lucide-react";
import type { OrdersFoodRow } from "@/hooks/useFoodOrders";
import { normalizeOrderItems, type NormalizedOrderLineItem } from "@/lib/orderLineItems";
import { OrderHistoryItemDetailsModal } from "@/components/OrderHistoryItemDetailsModal";
import { resolveMerchantCtm } from "@/lib/merchant-order-ctm";

function historyStatusLabel(status: string) {
  const s = status === "NEW" ? "CREATED" : status || "CREATED";
  const map: Record<string, string> = {
    CREATED: "CREATED",
    ACCEPTED: "ACCEPTED",
    PREPARING: "PREPARING",
    READY_FOR_PICKUP: "READY",
    OUT_FOR_DELIVERY: "PICKED UP",
    DELIVERED: "DELIVERED",
    RTO: "RTO",
    CANCELLED: "CANCELLED",
  };
  return map[s] || s.replace(/_/g, " ");
}

function historyBadgeClass(status: string) {
  const s = status === "NEW" ? "CREATED" : status || "CREATED";
  if (s === "PREPARING" || s === "ACCEPTED" || s === "CREATED")
    return "bg-violet-600 text-white";
  if (s === "READY_FOR_PICKUP") return "bg-emerald-600 text-white";
  if (s === "OUT_FOR_DELIVERY") return "bg-orange-500 text-white";
  if (s === "DELIVERED") return "bg-green-600 text-white";
  if (s === "RTO") return "bg-amber-600 text-white";
  if (s === "CANCELLED") return "bg-red-600 text-white";
  return "bg-slate-600 text-white";
}

export type UserInsightsOrderDetailsSidesheetProps = {
  open: boolean;
  onClose: () => void;
  /** Partnersite: public store id (GMMC…) */
  storeId: string;
  ordersCoreId?: number | null;
  formattedOrderId?: string | null;
};

function formatMoney(n: number) {
  return `₹${n.toFixed(2)}`;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-3 text-sm py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 text-right font-medium min-w-0 break-words">
        {value}
      </span>
    </div>
  );
}

function OrderTimeline({ order }: { order: OrdersFoodRow }) {
  const steps = [
    { label: "Placed", done: !!order.created_at },
    { label: "Accepted", done: !!order.accepted_at },
    { label: "Preparing", done: !!order.preparing_at || !!order.prepared_at },
    { label: "Ready", done: !!order.prepared_at },
    { label: "Dispatched", done: !!order.dispatched_at },
    { label: "Delivered", done: !!order.delivered_at },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((s) => (
        <span
          key={s.label}
          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
            s.done ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"
          }`}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function UserInsightsOrderDetailsSidesheet({
  open,
  onClose,
  storeId,
  ordersCoreId,
  formattedOrderId,
}: UserInsightsOrderDetailsSidesheetProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrdersFoodRow | null>(null);
  const [otp, setOtp] = useState<{
    otp_code: string;
    otp_type?: string;
    verified_at?: string | null;
  } | null>(null);
  const [itemDetailModal, setItemDetailModal] =
    useState<NormalizedOrderLineItem | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setOrder(null);
      setError(null);
      setOtp(null);
      return;
    }
    const coreId = ordersCoreId;
    const fmt = (formattedOrderId || "").trim();
    if (!coreId && !fmt) {
      setError("No order linked to this review.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (coreId) params.set("orders_core_id", String(coreId));
    else if (fmt) params.set("formatted_order_id", fmt);

    void fetch(
      `/api/food-orders?store_id=${encodeURIComponent(storeId)}&${params.toString()}`,
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load order");
        }
        const rows = (data.orders || []) as OrdersFoodRow[];
        if (!rows.length) throw new Error("Order not found");
        if (!cancelled) setOrder(rows[0]);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load order");
          setOrder(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, storeId, ordersCoreId, formattedOrderId]);

  useEffect(() => {
    if (!open || !order) {
      setOtp(null);
      return;
    }
    const foodRowId =
      (order as { orders_food_row_id?: number | null }).orders_food_row_id ??
      order.id;
    if (!foodRowId) return;
    void fetch(
      `/api/food-orders/${foodRowId}/otp?store_id=${encodeURIComponent(storeId)}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.otp_code) {
          setOtp({
            otp_code: data.otp_code,
            otp_type: data.otp_type,
            verified_at: data.verified_at,
          });
        }
      })
      .catch(() => setOtp(null));
  }, [open, order, storeId]);

  const lineItems = useMemo(
    () => normalizeOrderItems(order?.items ?? []),
    [order?.items],
  );
  const lineSum = lineItems.reduce((acc, it) => acc + it.total, 0);
  const pricing = order?.pricing;
  const subtotal = pricing?.subtotal ?? (lineSum > 0 ? lineSum : 0);
  const packaging = pricing?.packaging ?? 0;
  const taxes = pricing?.taxes ?? 0;
  const discount = pricing?.discount ?? 0;
  const total = order ? resolveMerchantCtm(order) : lineSum;

  if (!open || typeof document === "undefined") return null;

  const orderTitle =
    order?.formatted_order_id ||
    (order?.order_id ? String(order.order_id) : formattedOrderId) ||
    "Order";

  return createPortal(
    <div className="fixed inset-0 z-[2500] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        className="relative flex h-dvh w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-insights-order-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="user-insights-order-sheet-title"
              className="text-lg font-bold text-gray-900 truncate"
            >
              Order details
            </h2>
            {order ? (
              <p className="text-xs text-gray-500 mt-0.5 truncate">{orderTitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
              <p className="text-sm">Loading order…</p>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : order ? (
            <>
              <section>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-base font-bold text-gray-900">{orderTitle}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${historyBadgeClass(order.order_status || "")}`}
                  >
                    {historyStatusLabel(order.order_status || "")}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Placed{" "}
                  {new Date(order.created_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
                {otp ? (
                  <p className="mt-2 text-sm">
                    <span className="text-gray-600">OTP: </span>
                    <span className="font-mono font-bold text-gray-900">
                      {otp.otp_code}
                    </span>
                    {otp.otp_type ? (
                      <span className="text-gray-500 text-xs ml-1">({otp.otp_type})</span>
                    ) : null}
                    {otp.verified_at ? (
                      <span className="text-green-600 text-xs ml-2">Verified</span>
                    ) : null}
                  </p>
                ) : null}
              </section>

              <section className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <User size={14} /> Customer
                </p>
                <DetailRow label="Name" value={order.customer_name} />
                <DetailRow label="Phone" value={order.customer_phone} />
                <DetailRow label="Email" value={order.customer_email} />
                {order.customer_order_count != null ? (
                  <DetailRow
                    label="Orders with you"
                    value={String(order.customer_order_count)}
                  />
                ) : null}
                {order.customer_platform_order_count != null ? (
                  <DetailRow
                    label="Orders on GatiMitra"
                    value={String(order.customer_platform_order_count)}
                  />
                ) : null}
              </section>

              {(order.restaurant_name || order.order_type) && (
                <section className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Store &amp; type
                  </p>
                  <DetailRow label="Restaurant" value={order.restaurant_name} />
                  <DetailRow label="Order type" value={order.order_type} />
                  {order.eta_seconds != null ? (
                    <DetailRow
                      label="ETA"
                      value={`${Math.round(order.eta_seconds / 60)} min`}
                    />
                  ) : null}
                </section>
              )}

              {(order.drop_address_normalized || order.drop_address_raw) && (
                <section className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <MapPin size={14} /> Delivery
                  </p>
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {order.drop_address_normalized || order.drop_address_raw}
                  </p>
                  {order.delivery_instructions ? (
                    <p className="mt-2 text-xs text-gray-600">
                      <span className="font-medium">Instructions: </span>
                      {order.delivery_instructions}
                    </p>
                  ) : null}
                  {order.distance_km != null ? (
                    <p className="mt-1 text-xs text-gray-500">
                      Distance: {order.distance_km} km
                    </p>
                  ) : null}
                </section>
              )}

              {(order.rider_name || order.rider_phone) && (
                <section className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Bike size={14} /> Rider
                  </p>
                  <DetailRow label="Name" value={order.rider_name} />
                  <DetailRow label="Phone" value={order.rider_phone} />
                </section>
              )}

              <section className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Package size={14} /> Items
                </p>
                {lineItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No line items</p>
                ) : (
                  <ul className="space-y-2.5">
                    {lineItems.map((it, i) => (
                      <li
                        key={i}
                        className="flex justify-between gap-3 text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="text-gray-800 min-w-0">
                          <span className="font-medium">{it.quantity} × </span>
                          <button
                            type="button"
                            onClick={() => setItemDetailModal(it)}
                            className="font-medium text-gray-900 border-b border-dashed border-gray-400 hover:border-gray-700 hover:text-gray-700 text-left"
                          >
                            {it.name}
                          </button>
                          {it.customizations?.length ? (
                            <span className="block text-[11px] text-gray-500 mt-0.5">
                              {it.customizations.join(", ")}
                            </span>
                          ) : null}
                        </span>
                        <span className="font-semibold text-gray-900 shrink-0 tabular-nums">
                          {formatMoney(it.total)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-4 pt-3 border-t border-gray-200 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatMoney(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Packaging</span>
                    <span className="tabular-nums">{formatMoney(packaging)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Taxes</span>
                    <span className="tabular-nums">{formatMoney(taxes)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Discount</span>
                    <span className="tabular-nums">
                      {discount > 0 ? `−${formatMoney(discount)}` : formatMoney(0)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 pt-2">
                    <span>Total</span>
                    <span className="tabular-nums">{formatMoney(total)}</span>
                  </div>
                </div>
              </section>

              {(order.requires_utensils ||
                order.is_fragile ||
                order.is_high_value ||
                order.veg_non_veg) && (
                <section className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Order flags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {order.requires_utensils ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded-md">
                        <UtensilsCrossed size={10} /> Utensils
                      </span>
                    ) : null}
                    {order.veg_non_veg && order.veg_non_veg !== "na" ? (
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-md">
                        {order.veg_non_veg}
                      </span>
                    ) : null}
                    {order.is_fragile ? (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-md">
                        Fragile
                      </span>
                    ) : null}
                    {order.is_high_value ? (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] rounded-md">
                        High value
                      </span>
                    ) : null}
                  </div>
                </section>
              )}

              <section className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Status timeline
                </p>
                <OrderTimeline order={order} />
              </section>

              {order.cancelled_at || order.rejected_reason ? (
                <section className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <AlertCircle size={14} /> Cancellation
                  </p>
                  {order.rejected_reason ? (
                    <p className="text-sm text-red-900">{order.rejected_reason}</p>
                  ) : null}
                  {order.cancelled_at ? (
                    <p className="text-xs text-red-700 mt-1">
                      Cancelled{" "}
                      {new Date(order.cancelled_at).toLocaleString("en-IN")}
                    </p>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>

      <OrderHistoryItemDetailsModal
        open={itemDetailModal != null}
        onClose={() => setItemDetailModal(null)}
        lineItem={itemDetailModal}
        storeId={storeId}
      />
    </div>,
    document.body,
  );
}
