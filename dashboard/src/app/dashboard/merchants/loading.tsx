import { MerchantsPageSkeleton } from "@/components/skeletons/MerchantsPageSkeleton";

export default function MerchantsLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
      <MerchantsPageSkeleton />
    </div>
  );
}
