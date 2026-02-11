"use client";

import { TicketList } from "./TicketList";

export function TicketDashboardClient() {
  return (
    <div className="flex h-full w-full flex-col bg-gray-50 min-h-0">
      <div className="flex-1 min-h-0">
        <TicketList />
      </div>
    </div>
  );
}
