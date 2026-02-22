import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import { TicketDashboardClient } from "@/components/tickets/TicketDashboardClient";
import { TicketDetailLoader } from "@/components/tickets/ticket-view/TicketDetailLoader";

export const dynamic = "force-dynamic";

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }

  const { slug } = await params;
  const idSegment = slug?.[0];
  const ticketId = idSegment ? parseInt(idSegment, 10) : NaN;

  if (idSegment != null && idSegment !== "" && !isNaN(ticketId) && slug?.length === 1) {
    return <TicketDetailLoader ticketId={ticketId} />;
  }

  if (slug == null || slug.length === 0) {
    return <TicketDashboardClient />;
  }

  return (
    <div className="p-8 text-center">
      <p className="text-red-600 font-medium">Invalid ticket ID</p>
    </div>
  );
}
