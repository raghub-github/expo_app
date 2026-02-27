"use client";

import { useEffect, useMemo, useState } from "react";

interface OrderDetail {
  id: number;
  formattedOrderId: string | null;
  orderId: string | null;
  status: string;
  currentStatus: string | null;
  paymentStatus: string | null;
  createdAt: string;
  updatedAt: string;
  customerName: string | null;
  customerMobile: string | null;
  riderName: string | null;
  riderMobile: string | null;
  dropAddressRaw: string | null;
  merchantStoreId: number | null;
  merchantParentId: number | null;
}

export default function FoodOrderDetailClient({ orderId }: { orderId: number }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/orders/core?orderType=food&id=${orderId}&limit=1`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.success && Array.isArray(body.data) && body.data.length > 0) {
          const row = body.data[0];
          setOrder({
            id: row.id,
            formattedOrderId: row.formattedOrderId,
            orderId: row.orderId,
            status: row.status,
            currentStatus: row.currentStatus,
            paymentStatus: row.paymentStatus,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            customerName: row.customerName,
            customerMobile: row.customerMobile,
            riderName: row.riderName,
            riderMobile: row.riderMobile,
            dropAddressRaw: row.dropAddressRaw,
            merchantStoreId: row.merchantStoreId,
            merchantParentId: row.merchantParentId,
          });
        } else {
          setError("Order not found.");
        }
      })
      .catch(() => !cancelled && setError("Failed to load order."))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const displayId = useMemo(
    () =>
      order
        ? order.formattedOrderId ?? order.orderId ?? `GMF${order.id.toString().padStart(6, "0")}`
        : "—",
    [order]
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          <p className="mt-3 text-sm text-gray-500">Loading order details…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
        {error}
      </div>
    );
  }

  if (!order) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 shadow-sm">
        Order not found.
      </div>
    );
  }

  const statusLabel = order.currentStatus ?? order.status;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Order details
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            Order <span className="text-emerald-600">{displayId}</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            ID: <span className="font-mono text-slate-700">#{order.id}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {statusLabel || "—"}
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
            Payment&nbsp;
            <span className="font-semibold">
              {order.paymentStatus ? order.paymentStatus.toLowerCase() : "unknown"}
            </span>
          </span>
        </div>
      </div>

      {/* Main grid */}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {/* Customer & address */}
        <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              C
            </span>
            Customer
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="grid grid-cols-[110px,1fr] gap-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Name
              </dt>
              <dd className="font-medium text-slate-900">
                {order.customerName || "—"}
                {order.customerMobile && (
                  <span className="ml-1 text-xs text-slate-500">
                    ({order.customerMobile})
                  </span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-[110px,1fr] gap-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Delivery address
              </dt>
              <dd className="max-w-md text-slate-800">
                {order.dropAddressRaw || "—"}
              </dd>
            </div>
          </dl>
        </section>

        {/* Rider & meta */}
        <section className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              R
            </span>
            Rider & timeline
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="grid grid-cols-[110px,1fr] gap-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Rider
              </dt>
              <dd className="text-slate-900">
                {order.riderName || order.riderMobile || "—"}
              </dd>
            </div>
            <div className="grid grid-cols-[110px,1fr] gap-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Created
              </dt>
              <dd className="text-slate-800">
                {order.createdAt
                  ? new Date(order.createdAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div className="grid grid-cols-[110px,1fr] gap-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Updated
              </dt>
              <dd className="text-slate-800">
                {order.updatedAt
                  ? new Date(order.updatedAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Technical meta */}
      <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-slate-600">Internal refs</span>
          <span>
            Store ID:{" "}
            <span className="font-mono text-slate-700">
              {order.merchantStoreId ?? "—"}
            </span>
          </span>
          <span>
            Parent ID:{" "}
            <span className="font-mono text-slate-700">
              {order.merchantParentId ?? "—"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
