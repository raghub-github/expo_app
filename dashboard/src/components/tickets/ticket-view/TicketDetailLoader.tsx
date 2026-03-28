"use client";

import { TicketViewClient } from "./TicketViewClient";

export function TicketDetailLoader({ ticketId }: { ticketId: number | string }) {
  return <TicketViewClient ticketId={ticketId} />;
}
