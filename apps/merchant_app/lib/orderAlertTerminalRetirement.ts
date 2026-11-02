/**
 * In-memory GLOBAL order-alert retirement (Guarantee B).
 * Device-local mute must never write here.
 */
export type TerminalAlertStopReason = "accepted" | "rejected" | "cancelled" | "expired";

const TERMINAL_STOP_REASONS = new Set<TerminalAlertStopReason>([
  "accepted",
  "rejected",
  "cancelled",
  "expired",
]);

const RETIRED_TTL_MS = 24 * 60 * 60 * 1000;
const terminalRetiredOrders = new Map<string, { at: number; reason: TerminalAlertStopReason }>();

export function isTerminalAlertStopReason(
  reason: string | null | undefined
): reason is TerminalAlertStopReason {
  return reason != null && TERMINAL_STOP_REASONS.has(reason as TerminalAlertStopReason);
}

export function retireTerminalOrderAlert(
  orderId: string,
  reason: string
): void {
  const id = String(orderId ?? "").trim();
  if (!id || !isTerminalAlertStopReason(reason)) return;
  const terminalReason = reason;
  terminalRetiredOrders.set(id, { at: Date.now(), reason: terminalReason });
  if (terminalRetiredOrders.size > 120) {
    const now = Date.now();
    for (const [k, v] of terminalRetiredOrders) {
      if (now - v.at > RETIRED_TTL_MS) terminalRetiredOrders.delete(k);
    }
    if (terminalRetiredOrders.size > 80) {
      const oldest = [...terminalRetiredOrders.entries()]
        .sort((a, b) => a[1].at - b[1].at)
        .slice(0, terminalRetiredOrders.size - 60);
      for (const [k] of oldest) terminalRetiredOrders.delete(k);
    }
  }
}

export function isOrderAlertGloballyRetired(orderId: string | null | undefined): boolean {
  const id = String(orderId ?? "").trim();
  if (!id) return false;
  const row = terminalRetiredOrders.get(id);
  if (!row) return false;
  if (Date.now() - row.at > RETIRED_TTL_MS) {
    terminalRetiredOrders.delete(id);
    return false;
  }
  return true;
}

/** Test-only helper — do not use in production paths. */
export function __resetTerminalOrderAlertRetirementForTests(): void {
  terminalRetiredOrders.clear();
}
