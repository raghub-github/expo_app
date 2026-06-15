/** Post-delivery / post-cancellation window for in-app ticket intake from support chat. */
export const ORDER_SUPPORT_TICKET_WINDOW_MS = 4 * 60 * 60 * 1000;

type StatusHistoryEntry = { status: string; at: string };

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function lastStatusAt(
  history: StatusHistoryEntry[] | null | undefined,
  includes: string[]
): Date | null {
  if (!history?.length) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const raw = (history[i]?.status ?? "").trim().toLowerCase();
    if (!raw) continue;
    if (includes.some((part) => raw.includes(part))) {
      return parseIsoDate(history[i]?.at);
    }
  }
  return null;
}

export function isDeliveredOrCancelledStatus(status: string | null | undefined): boolean {
  const raw = (status ?? "").trim().toLowerCase();
  return raw.includes("deliver") || raw.includes("cancel");
}

/** Anchor time = when order was delivered or cancelled (whichever applies). */
export function resolveOrderSupportAnchorAt(input: {
  status?: string | null;
  currentStatus?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  statusHistory?: StatusHistoryEntry[] | null;
}): Date | null {
  const status = (input.currentStatus ?? input.status ?? "").trim().toLowerCase();

  if (status.includes("cancel")) {
    return (
      parseIsoDate(input.cancelledAt) ??
      lastStatusAt(input.statusHistory, ["cancel"]) ??
      parseIsoDate(input.deliveredAt)
    );
  }

  if (status.includes("deliver")) {
    return (
      parseIsoDate(input.deliveredAt) ??
      lastStatusAt(input.statusHistory, ["deliver"]) ??
      null
    );
  }

  return (
    parseIsoDate(input.deliveredAt) ??
    parseIsoDate(input.cancelledAt) ??
    lastStatusAt(input.statusHistory, ["deliver", "cancel"])
  );
}

export function isOrderSupportTicketWindowOpen(
  anchorAt: Date | null,
  nowMs: number = Date.now()
): boolean {
  if (!anchorAt) return true;
  return nowMs - anchorAt.getTime() <= ORDER_SUPPORT_TICKET_WINDOW_MS;
}
