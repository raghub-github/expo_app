import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import { TicketHelpdeskDashboardClient } from "@/components/tickets/TicketHelpdeskDashboardClient";

export default async function TicketsHelpdeskDashboardPage() {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }

  return <TicketHelpdeskDashboardClient />;
}
