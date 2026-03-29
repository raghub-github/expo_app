"use client";

import { TicketList } from "./TicketList";

export function TicketDashboardClient({
  variant = "default",
  hideExportAndSidebarToggle = false,
}: {
  /** Queue workspace: flat white panel like the main tickets list (no gradient chrome). */
  variant?: "default" | "queue";
  hideExportAndSidebarToggle?: boolean;
} = {}) {
  const isQueue = variant === "queue";
  return (
    <div
      className={`flex w-full flex-1 min-h-0 flex-col -mt-3 sm:-mt-4 -mb-3 sm:-mb-4 ${
        isQueue ? "" : "bg-gradient-to-b from-slate-50/80 to-gray-50/90"
      }`}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden border border-gray-200/80 bg-white ${
          isQueue ? "" : "rounded-t-xl border-b-0 bg-white/95 shadow-sm"
        }`}
      >
        <TicketList hideExportAndSidebarToggle={hideExportAndSidebarToggle} />
      </div>
    </div>
  );
}
