import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import { TicketViewClient } from "@/components/tickets/ticket-view/TicketViewClient";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (isNaN(ticketId)) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-medium">Invalid ticket ID</p>
      </div>
    );
  }

  return <TicketViewClient ticketId={ticketId} />;
}
