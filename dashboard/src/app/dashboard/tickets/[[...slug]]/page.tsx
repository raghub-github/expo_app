import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import { TicketsWorkspaceClient } from "@/components/tickets/TicketsWorkspaceClient";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }

  return <TicketsWorkspaceClient />;
}
