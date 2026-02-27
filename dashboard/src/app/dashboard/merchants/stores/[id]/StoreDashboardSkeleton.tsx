"use client";

/** Skeleton for store dashboard so UI feels instant while data loads. */
export function StoreDashboardSkeleton() {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] overflow-hidden w-full border-0 border-none shadow-none">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-8 py-5">
        <div className="max-w-[1600px] mx-auto space-y-5">
          {/* Wallet | Store Status | Delivery row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border-0 bg-white p-4 shadow-sm animate-pulse">
                <div className="h-4 w-24 rounded bg-gray-200 mb-3" />
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-10 rounded bg-gray-100" />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Date + Order flow */}
          <div className="flex flex-wrap items-stretch gap-4 mb-2">
            <div className="h-9 w-48 rounded-lg bg-gray-200 animate-pulse" />
            <div className="flex-1 min-w-[280px] h-20 rounded-xl bg-gray-100 animate-pulse" />
          </div>

          {/* 8 KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-xl border-0 bg-white p-3 shadow-sm animate-pulse">
                <div className="h-3 w-16 rounded bg-gray-200 mb-2" />
                <div className="h-6 w-12 rounded bg-gray-300" />
              </div>
            ))}
          </div>

          {/* Sales & Views charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-xl border-0 bg-white p-4 shadow-sm animate-pulse">
                <div className="h-4 w-20 rounded bg-gray-200 mb-2" />
                <div className="h-8 w-24 rounded bg-gray-300 mb-3" />
                <div className="h-[140px] rounded bg-gray-100" />
              </div>
            ))}
          </div>

          {/* Orders trend + Revenue */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-xl border-0 bg-white p-4 shadow-sm animate-pulse">
                <div className="h-4 w-28 rounded bg-gray-200 mb-3" />
                <div className="h-[180px] rounded bg-gray-100" />
              </div>
            ))}
          </div>

          {/* Category + Heatmap + Weekly */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border-0 bg-white p-4 shadow-sm animate-pulse">
                <div className="h-4 w-32 rounded bg-gray-200 mb-3" />
                <div className="h-[160px] rounded-full bg-gray-100 mx-auto max-w-[160px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
