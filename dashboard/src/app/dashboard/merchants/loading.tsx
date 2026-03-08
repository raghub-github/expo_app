import { CardSkeleton, TableSkeleton } from "@/components/ui/SkeletonLoader";

/** Instant skeleton when switching to Merchants — no blank page. */
export default function MerchantsLoading() {
  return (
    <div className="w-full max-w-full overflow-x-hidden animate-in fade-in duration-150">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex gap-4 flex-wrap">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
        <div className="p-4">
          <TableSkeleton rows={8} cols={5} />
        </div>
      </div>
    </div>
  );
}
