import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import { UnifiedTicketsList } from "@/components/tickets/UnifiedTicketsList";

export default async function UnifiedTicketsPage() {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }

  return (
    <div className="flex flex-col h-full w-full max-w-full overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-semibold text-gray-900">Unified Tickets</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Tickets from <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">public.unified_tickets</code>
        </p>
      </div>
      <div className="flex-1 min-h-0 p-4">
        <UnifiedTicketsList />
      </div>
    </div>
  );
}
