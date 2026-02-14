import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import { NewTicketForm } from "@/components/tickets/NewTicketForm";

export default async function NewTicketPage() {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }

  return (
    <div className="min-h-full bg-gray-50/80 p-4 sm:p-6">
      <NewTicketForm />
    </div>
  );
}
