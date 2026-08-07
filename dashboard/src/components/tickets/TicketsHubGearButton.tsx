"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";

import { Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  AGENT_ACTIVITY_PATH,
  TICKETS_HELPDESK_DASHBOARD_PATH,
} from "@/lib/tickets/ticket-path-utils";

const TICKETS_MAIN_LIST_PATH = "/dashboard/tickets";

/** Gear next to Queue: opens helpdesk metrics dashboard, or returns to ticket list from hub pages. */
export function TicketsHubGearButton() {
  const router = useRouter();
  const pathname = useAppPathname();
  const cleanPathname = pathname.split("?")[0].split("#")[0] ?? "";

  const onHelpdeskDashboard = cleanPathname === TICKETS_HELPDESK_DASHBOARD_PATH;
  const onAgentActivity = cleanPathname === AGENT_ACTIVITY_PATH;
  const onTicketsHubPage = onHelpdeskDashboard || onAgentActivity;

  const handleClick = () => {
    if (onHelpdeskDashboard || onAgentActivity) {
      router.push(TICKETS_MAIN_LIST_PATH, { scroll: false });
      return;
    }
    router.push(TICKETS_HELPDESK_DASHBOARD_PATH, { scroll: false });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={onTicketsHubPage}
      className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 border-transparent transition-[background-color,color] duration-200 ease-out motion-reduce:transition-none ${
        onTicketsHubPage
          ? "bg-[#121212] text-white hover:bg-black"
          : "bg-transparent text-gray-600 hover:bg-gray-200/90 hover:text-gray-900"
      }`}
      title={onTicketsHubPage ? "Back to ticket list" : "Open GatiMitra Queue dashboard"}
      aria-label={onTicketsHubPage ? "Back to ticket list" : "Open GatiMitra Queue dashboard"}
    >
      <Settings className="h-4 w-4 shrink-0" aria-hidden />
    </button>
  );
}

