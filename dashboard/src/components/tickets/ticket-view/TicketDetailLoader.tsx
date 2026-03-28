"use client";

import { Suspense } from "react";
import { TicketViewClient } from "./TicketViewClient";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function TicketDetailLoader({ ticketId }: { ticketId: number | string }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center bg-[#f5f7f9]">
          <LoadingSpinner />
        </div>
      }
    >
      <TicketViewClient ticketId={ticketId} />
    </Suspense>
  );
}
