"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTicketsAgentsQuery } from "@/hooks/tickets/useTicketsAgentsQuery";
import { TicketDashboardClient } from "@/components/tickets/TicketDashboardClient";
import { QUEUE_HOME_ACTIVE_STATUSES_URL } from "@/lib/tickets/queue-ticket-filters";

/** Queue → Home: ticket board filtered to the signed-in agent. */
export function QueueHomeClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: agentsData, isSuccess } = useTicketsAgentsQuery();

  useEffect(() => {
    if (!isSuccess || !agentsData?.currentUser?.id) return;
    const id = String(agentsData.currentUser.id);
    const statusWant = QUEUE_HOME_ACTIVE_STATUSES_URL.join(",");
    const currentAssignee = searchParams.get("assignedToIds")?.split(",").filter(Boolean) ?? [];
    const currentStatus = searchParams.get("status") ?? "";
    if (currentAssignee.length === 1 && currentAssignee[0] === id && currentStatus === statusWant) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("assignedToIds", id);
    next.set("status", statusWant);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [isSuccess, agentsData?.currentUser?.id, pathname, router, searchParams]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TicketDashboardClient variant="queue" hideExportAndSidebarToggle />
    </div>
  );
}
