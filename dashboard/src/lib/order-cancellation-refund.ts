function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

const PRE_ACCEPT_STATUSES = new Set([
  "CREATED",
  "NEW",
  "PLACED",
  "ORDER_RECEIVED",
  "ORDER_PLACED",
  "PYMT ASSIGN RX",
  "PAYMENT DONE",
]);

export function resolveOrderCancellationRefund(input: {
  previousStatus: string;
  acceptedAt?: string | null;
  grandTotal: unknown;
  cancelMode?: string | null;
  rejectedReason?: string | null;
}): { refundStatus: string; refundAmount: number | null } {
  const prev = String(input.previousStatus ?? "").toUpperCase();
  const wasAccepted = Boolean(input.acceptedAt);
  const grandTotal = round2(num(input.grandTotal));
  const preAccept =
    !wasAccepted &&
    (PRE_ACCEPT_STATUSES.has(prev) ||
      prev.includes("CREATED") ||
      prev.includes("PLACED") ||
      prev.includes("NEW"));

  if (preAccept && grandTotal > 0) {
    return { refundStatus: "pending", refundAmount: grandTotal };
  }

  return { refundStatus: "no_refund", refundAmount: null };
}
