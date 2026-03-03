"use client";

/** Skeleton for merchant portal parent search — shown while parent list is loading. */
export function MerchantParentSkeleton() {
  return (
    <div className="space-y-3 animate-pulse border-0 border-none shadow-none">
      <div className="rounded-lg border-0 border-none bg-white overflow-hidden shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/50 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-gray-200" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-3 w-24 rounded bg-gray-100" />
              </div>
            </div>
            <div className="h-5 w-16 rounded-full bg-gray-200" />
          </div>
        </div>
        <div className="px-3 py-2.5 space-y-2">
          <div className="h-3 w-28 rounded bg-gray-100" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-gray-100 bg-gray-50/50 px-2.5 py-2">
              <div className="h-3.5 w-3.5 rounded bg-gray-200 shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-24 rounded bg-gray-200" />
                <div className="h-2.5 w-20 rounded bg-gray-100" />
              </div>
              <div className="h-6 w-16 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border-0 border-none bg-white overflow-hidden shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/50 px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-gray-200" />
            <div className="h-4 w-28 rounded bg-gray-200" />
          </div>
        </div>
        <div className="px-3 py-2.5">
          <div className="h-3 w-24 rounded bg-gray-100 mb-2" />
          <div className="space-y-1.5">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
