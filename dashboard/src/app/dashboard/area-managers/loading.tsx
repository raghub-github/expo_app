import { CardSkeleton } from "@/components/ui/SkeletonLoader";

export default function AreaManagersLoading() {
  return (
    <div className="w-full max-w-full overflow-x-hidden animate-in fade-in duration-150">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="h-6 w-48 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 flex-1 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 flex-1 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
