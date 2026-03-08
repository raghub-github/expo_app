import { CardSkeleton } from "@/components/ui/SkeletonLoader";

/** Instant skeleton when switching to Analytics — no blank page. */
export default function AnalyticsLoading() {
  return (
    <div className="w-full max-w-full overflow-x-hidden animate-in fade-in duration-150">
      <div className="mb-4 h-8 w-40 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}
