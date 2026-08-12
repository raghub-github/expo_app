"use client";

/** Pulse placeholder matching live order card / history list row layout. */
export function OrderCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="h-5 w-20 rounded bg-gray-200 animate-pulse" />
        <div className="h-4 w-16 rounded bg-gray-100 animate-pulse" />
      </div>
      <div className="h-3.5 w-2/3 rounded bg-gray-200 animate-pulse" />
      <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
      <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
      <div className="flex gap-2 pt-1">
        <div className="h-8 flex-1 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-8 w-20 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    </div>
  );
}

/** History sidebar row placeholders. */
export function OrderHistoryListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-busy aria-label="Loading orders">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="h-4 w-16 rounded-md bg-gray-200 animate-pulse" />
            <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="h-3.5 w-28 rounded bg-gray-200 animate-pulse" />
          <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
          <div className="flex justify-end">
            <div className="h-4 w-14 rounded bg-gray-200 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Content-area skeleton for live orders grid (chrome stays outside). */
export function OrdersContentSkeleton() {
  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4"
      aria-busy
      aria-label="Loading orders"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <OrderCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * Full-page fallback (Suspense / first paint). Includes chrome-like bars so it
 * feels like the orders shell rather than a centered spinner.
 */
export function PageSkeletonOrders() {
  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-gray-50"
      aria-busy
      aria-label="Loading orders"
    >
      <div className="shrink-0 z-30 border-b border-gray-200 bg-white px-3 sm:px-4 lg:px-6 py-2 sm:py-3 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 w-24 rounded-full bg-gray-100 animate-pulse" />
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full xl:w-auto">
            <div className="h-10 w-full sm:w-40 rounded-lg bg-gray-100 animate-pulse" />
            <div className="h-10 flex-1 sm:min-w-[220px] lg:min-w-[300px] rounded-lg bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
      <OrdersContentSkeleton />
    </div>
  );
}
