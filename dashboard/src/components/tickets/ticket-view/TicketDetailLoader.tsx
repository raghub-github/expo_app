"use client";

import { TicketViewClient } from "./TicketViewClient";

export function TicketDetailLoader({ ticketId }: { ticketId: number }) {
  return <TicketViewClient ticketId={ticketId} />;
}
