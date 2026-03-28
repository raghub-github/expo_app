"use client";

import { ArrowLeft, BarChart3, Zap } from "lucide-react";
import { useRightSidebar } from "@/context/RightSidebarContext";

/** Right rail on ticket detail (gear): navigation only — main column shows the selected section. */
export function TicketRightSidebarSettingsPanel() {
  const right = useRightSidebar();
  const section = right?.ticketSettingsSection ?? "automation";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F5F7F9]">
      <div className="shrink-0 border-b border-gray-200 bg-white/90 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">Ticket settings</h2>
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
          Choose a section — content opens in the main area.
        </p>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2" aria-label="Ticket settings sections">
        <button
          type="button"
          onClick={() => right?.setTicketSettingsSection?.("automation")}
          className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 text-left text-xs font-medium transition-colors ${
            section === "automation"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-gray-800 hover:bg-gray-200/80"
          }`}
        >
          <Zap className="h-4 w-4 shrink-0" aria-hidden />
          Automation
        </button>
        <button
          type="button"
          onClick={() => right?.setTicketSettingsSection?.("activity")}
          className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2.5 text-left text-xs font-medium transition-colors ${
            section === "activity"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-gray-800 hover:bg-gray-200/80"
          }`}
        >
          <BarChart3 className={`h-4 w-4 shrink-0 ${section === "activity" ? "text-white" : "text-violet-600"}`} aria-hidden />
          Activity
        </button>
      </nav>
    </div>
  );
}
