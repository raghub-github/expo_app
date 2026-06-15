"use client";

interface SkeletonLoaderProps {
  className?: string;
  count?: number;
  height?: string;
}

export function SkeletonLoader({ 
  className = "",
  count = 1,
  height = "h-4"
}: SkeletonLoaderProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${height} bg-gray-200 rounded animate-pulse ${className}`}
        />
      ))}
    </>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <div
              key={colIndex}
              className="flex-1 h-4 bg-gray-200 rounded animate-pulse"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="h-6 bg-gray-200 rounded animate-pulse w-3/4" />
      <div className="h-4 bg-gray-200 rounded animate-pulse w-full" />
      <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6" />
    </div>
  );
}

/** Compact skeleton matching subscription plan cards in Offers admin. */
export function SubscriptionPlanCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col overflow-hidden">
      <div className="flex justify-between px-2.5 pt-2">
        <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-12 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="px-2.5 pt-2 pb-1 flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-gray-200 animate-pulse shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-2/3 bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-1/3 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
      <div className="px-2.5 py-2 space-y-2 flex-1">
        <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
        <div className="space-y-1">
          <div className="h-2.5 w-full bg-gray-100 rounded animate-pulse" />
          <div className="h-2.5 w-5/6 bg-gray-100 rounded animate-pulse" />
          <div className="h-2.5 w-4/6 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
      <div className="px-2.5 py-2 border-t border-gray-100 flex gap-1">
        <div className="flex-1 h-7 bg-gray-100 rounded-md animate-pulse" />
        <div className="flex-1 h-7 bg-gray-100 rounded-md animate-pulse" />
      </div>
    </div>
  );
}
