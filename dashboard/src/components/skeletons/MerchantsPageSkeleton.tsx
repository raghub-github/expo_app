/** Merchants list shell — server-safe (no "use client") for route `loading.tsx`. */
export function MerchantsPageSkeleton() {
  return (
    <div className="w-full max-w-full overflow-x-hidden animate-in fade-in duration-150">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 h-4 w-24 animate-pulse rounded bg-gray-200" />
            <div className="h-8 w-16 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="flex flex-wrap gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-24 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 w-28 animate-pulse rounded bg-gray-100" />
              <div className="h-4 flex-1 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
