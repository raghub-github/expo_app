import { TableSkeleton } from "@/components/ui/SkeletonLoader";

/** Instant skeleton when switching to Orders — no blank page. */
export default function OrdersLoading() {
  return (
    <div className="w-full max-w-full overflow-x-hidden animate-in fade-in duration-150">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex gap-4 flex-wrap">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
        <div className="p-4">
          <TableSkeleton rows={8} cols={6} />
        </div>
      </div>
    </div>
  );
}
