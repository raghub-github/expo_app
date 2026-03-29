import { Suspense } from "react";
import { redirect } from "next/navigation";
import { checkDashboardAccess, requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { QueueSupervisorClient } from "@/components/tickets/queue/QueueSupervisorClient";
import { normalizeQueueSupervisorSection } from "@/lib/tickets/queue-supervisor-sections";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export const dynamic = "force-dynamic";

export default async function QueueSupervisorPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; agentId?: string }>;
}) {
  const hasTicketAccess = await checkDashboardAccess("TICKET");
  if (!hasTicketAccess) {
    await requireSuperAdminAccess();
  }
  const sp = await searchParams;
  const section = normalizeQueueSupervisorSection(sp.section);
  if (sp.section !== section) {
    const p = new URLSearchParams();
    p.set("section", section);
    const aid = typeof sp.agentId === "string" ? sp.agentId.trim() : "";
    if (aid) p.set("agentId", aid);
    redirect(`/dashboard/tickets/queue/supervisor?${p.toString()}`);
  }
  return (
    <Suspense
      fallback={
        <div className="flex min-h-0 flex-1 items-center justify-center bg-gradient-to-b from-slate-50/80 to-gray-50/90 p-12">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <QueueSupervisorClient />
    </Suspense>
  );
}
