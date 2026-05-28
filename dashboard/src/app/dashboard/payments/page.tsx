import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { PaymentManagementClient } from "@/components/payments/PaymentManagementClient";

export default async function PaymentsPage() {
  await requireDashboardAccess("PAYMENT");

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden pl-2 pr-3 pt-3 pb-4 sm:pl-3 sm:pr-4 sm:pt-4">
      <PaymentManagementClient />
    </div>
  );
}
