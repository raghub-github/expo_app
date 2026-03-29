import { Suspense } from "react";
import { checkDashboardAccess, requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { QueueManagerClient } from "@/components/tickets/queue/QueueManagerClient";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const dynamic = "force-dynamic";

export default async function QueueManagerPage() {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center bg-gradient-to-b from-slate-50/80 to-gray-50/90 p-12">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <QueueManagerClient />
    </Suspense>
  );
}
