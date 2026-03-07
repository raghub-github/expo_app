import { TableSkeleton } from "@/components/ui/SkeletonLoader";

/** Instant skeleton when switching to System — no blank page. */
export default function SystemLoading() {
  return (
    <div className="w-full max-w-full overflow-x-hidden animate-in fade-in duration-150">
      <div className="mb-4 h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <TableSkeleton rows={8} cols={4} />
      </div>
    </div>
  );
}
