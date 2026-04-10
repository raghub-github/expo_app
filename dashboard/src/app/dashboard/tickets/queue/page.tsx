import { redirect } from "next/navigation";
import {
  checkDashboardAccess,
  checkDashboardAccessPointAction,
  requireSuperAdminAccess,
} from "@/lib/permissions/page-protection";

export default async function TicketsQueueIndexPage() {
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
  redirect("/dashboard/tickets/queue/home");
}
