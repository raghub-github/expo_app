import {
  checkDashboardAccess,
  checkDashboardAccessPointAction,
  requireSuperAdminAccess,
} from "@/lib/permissions/page-protection";
import { redirect } from "next/navigation";
import { QueueHomeClient } from "@/components/tickets/queue/QueueHomeClient";

export const dynamic = "force-dynamic";

export default async function QueueHomePage() {
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
  return <QueueHomeClient />;
}
