import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { TransactionsClient } from "@/components/transactions/TransactionsClient";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage() {
  // Financial data — super admin only (soft-fails to /dashboard on a permissions blip).
  await requireSuperAdminAccess();

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 flex-col overflow-hidden">
      <TransactionsClient />
    </div>
  );
}
