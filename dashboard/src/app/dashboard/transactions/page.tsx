import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { TransactionsClient } from "@/components/transactions/TransactionsClient";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  // Financial data — super admin only (soft-fails to /dashboard on a permissions blip).
  await requireSuperAdminAccess();

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden px-4 pt-1 pb-4 sm:px-6 sm:pt-2">
      <TransactionsClient />
    </div>
  );
}
