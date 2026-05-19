"use client";

export function SkeletonReviewRow() {
  return (
    <div className="animate-pulse bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3">
            <div className="h-6 bg-gray-200 rounded w-32" />
            <div className="h-5 bg-gray-100 rounded w-24" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-full mb-1" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
        </div>
        <div className="h-8 bg-gray-200 rounded w-24 ml-4" />
      </div>
    </div>
  );
}
