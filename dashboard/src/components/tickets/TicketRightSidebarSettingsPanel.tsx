"use client";

import { ArrowLeft, BarChart3 } from "lucide-react";
import { useRightSidebar } from "@/context/RightSidebarContext";

/** Right rail on ticket detail (gear): activity reports — automation lives under Queue → Manager. */
export function TicketRightSidebarSettingsPanel() {
  const right = useRightSidebar();

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F5F7F9]">
      <div className="shrink-0 border-b border-gray-200 bg-white/90 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Activity</h2>
          <button
            type="button"
            onClick={() => right?.setTicketRightSidebarPanel?.("properties")}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Properties
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-gray-500">
          Metrics and time tracking. For automation, open Queue → Manager (new tab from Tickets).
        </p>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Ticket settings">
        <button
          type="button"
          onClick={() => right?.setTicketSettingsSection?.("activity")}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-2 py-2.5 text-left text-xs font-medium text-white shadow-sm"
        >
          <BarChart3 className="h-4 w-4 shrink-0 text-white" aria-hidden />
          Activity & reports
        </button>
      </nav>
    </div>
  );
}
