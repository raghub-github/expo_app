/** Shared payout timeline labels for merchant ledger expand / Date column. */

export type PayoutTimelineSource = {
  status?: string | null;
  requested_at?: string | null;
  approved_at?: string | null;
  processed_at?: string | null;
  completed_at?: string | null;
};

export function formatPayoutDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

/** Settled / Hold / Rejected timestamp for a payout request. */
export function resolvePayoutStatusTimeline(payout: PayoutTimelineSource | null | undefined): {
  label: "Settled" | "Hold" | "Rejected" | null;
  at: string | null;
} {
  if (!payout) return { label: null, at: null };
  const s = String(payout.status ?? "").toUpperCase();
  if (s === "COMPLETED") {
    return { label: "Settled", at: payout.completed_at ?? payout.processed_at ?? null };
  }
  if (s === "APPROVED" || s === "PROCESSING") {
    return {
      label: "Hold",
      at: payout.approved_at ?? payout.processed_at ?? null,
    };
  }
  if (s === "REJECTED" || s === "CANCELLED" || s === "FAILED" || s === "RETURNED" || s === "REVERSED") {
    return {
      label: "Rejected",
      at: payout.completed_at ?? payout.processed_at ?? payout.approved_at ?? null,
    };
  }
  return { label: null, at: null };
}
