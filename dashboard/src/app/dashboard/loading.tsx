import { TableSkeleton } from "@/components/ui/SkeletonLoader";

/** Shown when switching dashboard sections — instant skeleton instead of blank or spinner. */
export default function DashboardSectionLoading() {
  return (
    <div className="w-full max-w-full overflow-x-hidden animate-in fade-in duration-150">
      <div className="mb-4 h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <TableSkeleton rows={8} cols={5} />
      </div>
    </div>
  );
}
