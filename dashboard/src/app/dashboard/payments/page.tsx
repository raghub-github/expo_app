import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { PaymentManagementClient } from "@/components/payments/PaymentManagementClient";

export default async function PaymentsPage() {
  // Super-admin only. Use requireSuperAdminAccess so a permissions DB blip
  // soft-fails to /dashboard instead of /login (requireDashboardAccess used to logout).
  await requireSuperAdminAccess();

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden">
      <PaymentManagementClient />
    </div>
  );
}
