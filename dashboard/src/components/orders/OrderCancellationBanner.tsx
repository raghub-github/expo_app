'use client';

import type { OrdersFoodRow } from '@/lib/types/food-orders';

export function OrderCancellationBanner({ order }: { order: OrdersFoodRow }) {
  if (
    !order.rejected_reason &&
    !order.cancelled_by_label &&
    !order.cancelled_by_type &&
    order.order_status !== 'CANCELLED'
  ) {
    return null;
  }

  return (
    <div className="rounded-lg bg-red-50/90 p-3 border border-red-200/80">
      <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5">
        Cancellation
      </p>
      {order.cancelled_by_label ? (
        <p className="text-xs font-semibold text-red-800 mb-1">{order.cancelled_by_label}</p>
      ) : null}
      {order.rejected_reason ? (
        <p className="text-sm text-red-900 font-medium leading-relaxed break-words">
          {order.rejected_reason}
        </p>
      ) : null}
      {order.cancelled_by_type ? (
        <p className="text-[10px] text-red-700 mt-1.5 capitalize">
          {order.cancelled_by_type}
          {order.cancelled_at ? (
            <span className="ml-1.5 text-red-600">
              • {new Date(order.cancelled_at).toLocaleString('en-IN')}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
