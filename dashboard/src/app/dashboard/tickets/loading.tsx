import { TicketsPageSkeleton } from "@/components/skeletons/TicketsPageSkeleton";

export default function TicketsLoading() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <TicketsPageSkeleton />
    </div>
  );
}
