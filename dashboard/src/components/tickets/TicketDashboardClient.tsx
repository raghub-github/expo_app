"use client";

import { TicketList } from "./TicketList";

export function TicketDashboardClient() {
  return (
    <div className="flex flex-col w-full flex-1 min-h-0 -mt-3 sm:-mt-4 -mb-3 sm:-mb-4 bg-gradient-to-b from-slate-50/80 to-gray-50/90">
      <div className="flex-1 min-h-0 flex flex-col rounded-t-xl overflow-hidden shadow-sm border border-gray-200/80 border-b-0 bg-white/95">
        <TicketList />
      </div>
    </div>
  );
}
