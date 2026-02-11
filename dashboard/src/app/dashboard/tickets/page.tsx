import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import { TicketDashboardClient } from "@/components/tickets/TicketDashboardClient";

export default async function TicketsPage() {
  // Check if user has access to TICKET dashboard
  const hasTicketAccess = await checkDashboardAccess("TICKET");

  // If user has no access to ticket dashboard, redirect
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }

  return <TicketDashboardClient />;
}
