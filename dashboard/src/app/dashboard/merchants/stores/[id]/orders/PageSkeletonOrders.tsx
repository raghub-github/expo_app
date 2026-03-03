"use client";

export function PageSkeletonOrders() {
  return (
    <div className="flex flex-col h-full min-h-[400px] bg-gray-50 p-4">
      <div className="h-14 bg-gray-200 rounded-lg animate-pulse mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 flex-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-full mb-2" />
            <div className="h-4 bg-gray-100 rounded w-2/3 mb-4" />
            <div className="flex gap-2 mt-3">
              <div className="h-8 bg-gray-200 rounded w-20" />
              <div className="h-8 bg-gray-200 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
