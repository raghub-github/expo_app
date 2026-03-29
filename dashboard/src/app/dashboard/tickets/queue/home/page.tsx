import { checkDashboardAccess, requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { QueueHomeClient } from "@/components/tickets/queue/QueueHomeClient";

export const dynamic = "force-dynamic";

export default async function QueueHomePage() {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }
  return <QueueHomeClient />;
}
