import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { PaymentManagementClient } from "@/components/payments/PaymentManagementClient";

export default async function PaymentsPage() {
  await requireDashboardAccess("PAYMENT");

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden px-4 pt-1 pb-4 sm:px-6 sm:pt-2">
      <PaymentManagementClient />
    </div>
  );
}
