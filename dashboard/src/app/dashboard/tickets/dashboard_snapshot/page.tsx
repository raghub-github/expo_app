import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import { TicketHelpdeskDashboardClient } from "@/components/tickets/TicketHelpdeskDashboardClient";

export default async function TicketsHelpdeskDashboardSnapshotPage() {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TicketHelpdeskDashboardClient />
    </div>
  );
}
