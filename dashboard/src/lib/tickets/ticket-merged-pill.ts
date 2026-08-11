import type { Ticket } from "@/hooks/tickets/useTickets";

/** Label + tooltip for the Merged chip on list/card views. */
export function ticketMergedPill(
  ticket: Pick<
    Ticket,
    "isMerged" | "isMergePrimary" | "mergedChildCount" | "parentTicketId" | "mergedIntoTicketNumber"
  >,
  options?: { compact?: boolean }
): { label: string; title: string } | null {
  if (!ticket.isMerged) return null;
  const compact = options?.compact === true;

  if (ticket.isMergePrimary || (ticket.parentTicketId == null && (ticket.mergedChildCount ?? 0) > 0)) {
    const count = ticket.mergedChildCount ?? 0;
    const title =
      count > 0
        ? `${count} duplicate ticket${count === 1 ? "" : "s"} merged into this primary ticket`
        : "Primary ticket for merged duplicates";
    if (compact) {
      return {
        label: count > 0 ? `Merged · ${count}` : "Merged",
        title,
      };
    }
    return {
      label: count > 0 ? `Merged · Primary · ${count}` : "Merged · Primary",
      title,
    };
  }

  const into =
    ticket.mergedIntoTicketNumber && String(ticket.mergedIntoTicketNumber).trim()
      ? String(ticket.mergedIntoTicketNumber).trim()
      : ticket.parentTicketId != null
        ? String(ticket.parentTicketId)
        : null;
  const intoLabel = into ? (into.startsWith("#") ? into : `#${into}`) : null;

  if (compact) {
    return {
      label: "Merged",
      title: intoLabel
        ? `This ticket was merged into ${intoLabel}`
        : "This ticket was merged into another ticket",
    };
  }

  return {
    label: intoLabel ? `Merged · ${intoLabel}` : "Merged",
    title: intoLabel
      ? `This ticket was merged into ${intoLabel}`
      : "This ticket was merged into another ticket",
  };
}
