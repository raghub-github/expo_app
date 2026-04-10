import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  checkDashboardAccess,
  checkDashboardAccessPointAction,
  requireSuperAdminAccess,
} from "@/lib/permissions/page-protection";
import { QueueManagerClient } from "@/components/tickets/queue/QueueManagerClient";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const dynamic = "force-dynamic";

export default async function QueueManagerPage() {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }
  const hasQueueEntryAccess = await checkDashboardAccessPointAction(
    "TICKET",
    "TICKET_AGENT_STATUS_TOGGLE",
    "UPDATE"
  );
  if (!hasQueueEntryAccess) {
    redirect("/dashboard/tickets");
  }
  const hasManagerAccess = await checkDashboardAccessPointAction(
    "TICKET",
    "TICKET_QUEUE_MANAGER",
    "VIEW"
  );
  if (!hasManagerAccess) {
    redirect("/dashboard/tickets/queue/home");
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
