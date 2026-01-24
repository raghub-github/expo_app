import { requireSuperAdminAccess, checkDashboardAccess } from "@/lib/permissions/page-protection";
import Link from "next/link";
import { UtensilsCrossed, Car, Package, Ticket, Users, UserCog, Store } from "lucide-react";

export default async function TicketsPage() {
  // Check if user has access to TICKET dashboard
  const hasTicketAccess = await checkDashboardAccess("TICKET");

  // If user has no access to ticket dashboard, redirect
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <p className="text-sm sm:text-base text-gray-600">
          Manage all tickets with granular access control. Use filters to view tickets by order type, section, and category.
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-600">
          The ticket dashboard now uses a unified view with filtering options. Access to specific ticket types, sections, and actions is controlled through granular access points configured in your user profile.
        </p>
        <p className="mt-4 text-sm text-gray-500">
          Filtering and access control will be implemented in the ticket list component based on your assigned access points.
        </p>
      </div>
    </div>
  );
}
