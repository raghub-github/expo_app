"use client";

export function MenuItemsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
          <div className="flex p-2.5 gap-2.5">
            <div className="w-14 h-14 rounded-lg bg-gray-200 shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-1/4" />
              <div className="flex gap-1.5 mt-2">
                <div className="h-6 w-16 bg-gray-100 rounded" />
                <div className="h-6 w-12 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
