const GATIMITRA_BRAND = "GatiMitra";

function formatPct(pct: number): string {
  const n = Math.round(pct * 100) / 100;
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

/** Wallet ledger row text when cancellation does not credit/debit the balance. */
export function buildCancellationInfoLedgerDescription(args: {
  formattedOrderId: string;
  balanceImpact: "none" | "debit";
  compensationMeta?: Record<string, unknown> | null;
}): string {
  const orderId = args.formattedOrderId.trim() || "Order";

  if (args.balanceImpact === "debit") {
    const mode = String(args.compensationMeta?.merchant_debit_mode ?? "").trim().toLowerCase();
    if (mode === "partial_debit") {
      return `Order ${orderId} cancelled — partial cancellation charges deducted from wallet`;
    }
    return `Order ${orderId} cancelled — cancellation charges deducted from wallet`;
  }

  const meta = args.compensationMeta ?? {};
  const eligible = String(meta.eligible_message ?? "").trim();
  if (eligible) {
    return `Order ${orderId} — ${eligible}`;
  }

  const policyTitle = String(meta.applied_policy_title ?? "").trim();
  const policyDesc = String(meta.applied_policy_description ?? "").trim();
  const pct = Number(meta.compensation_pct ?? 0);
  const reason = String(meta.reason_detail ?? meta.rejected_reason ?? "").trim();
  const brand = String(meta.cancelled_by_brand ?? GATIMITRA_BRAND).trim() || GATIMITRA_BRAND;
  const reasonPart = reason
    ? `Cancelled by ${brand}: ${reason}`
    : `Cancelled by ${brand}`;

  if (Number.isFinite(pct) && pct <= 0.009) {
    const why = policyTitle
      ? `No compensation — ${policyTitle}${policyDesc ? `. ${policyDesc}` : ""}`
      : "No compensation as per cancellation policy";
    return `Order ${orderId} · ${reasonPart}. ${why}`;
  }

  if (policyTitle && Number.isFinite(pct)) {
    return `Order ${orderId} · ${reasonPart}. ${policyTitle} (${formatPct(pct)}% of net order value credited).`;
  }

  if (policyTitle) {
    return `Order ${orderId} · ${reasonPart}. ${policyTitle}.`;
  }

  return `Order ${orderId} · ${reasonPart}. No compensation as per cancellation policy.`;
}
