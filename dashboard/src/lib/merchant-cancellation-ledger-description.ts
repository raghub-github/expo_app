const GATIMITRA_BRAND = "GatiMitra";

function formatPct(pct: number): string {
  const n = Math.round(pct * 100) / 100;
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

export function isAutoCancellationContext(args: {
  cancelledByType?: string | null;
  cancelledByLabel?: string | null;
  reason?: string | null;
  reasonCode?: string | null;
  triggerSource?: string | null;
  cancelMode?: string | null;
}): boolean {
  const type = String(args.cancelledByType ?? "").trim().toLowerCase();
  const label = String(args.cancelledByLabel ?? "").trim();
  const reason = String(args.reason ?? "").trim();
  const code = String(args.reasonCode ?? "").trim();
  const source = String(args.triggerSource ?? "").trim().toLowerCase();
  const mode = String(args.cancelMode ?? "").trim().toLowerCase();
  return (
    type === "system" ||
    mode === "auto" ||
    source === "system" ||
    source === "auto-cancel" ||
    source === "auto_cancel" ||
    /^auto cancel/i.test(label) ||
    /^auto cancel/i.test(reason) ||
    /merchant_accept_timeout/i.test(`${code} ${reason} ${label}`)
  );
}

/** Ops-dashboard copy: why the order was cancelled (not merchant compensation policy). */
export const STORE_ACCEPT_TIMEOUT_OPS_REASON =
  "Auto-cancelled because the order was not accepted by the store within the configured timeframe.";

export function dashboardOpsCancelReason(args: {
  cancelledByType?: string | null;
  cancelledByLabel?: string | null;
  reason?: string | null;
  reasonCode?: string | null;
  cancelMode?: string | null;
}): string | null {
  const blob = `${args.reasonCode ?? ""} ${args.reason ?? ""} ${args.cancelledByLabel ?? ""}`;
  if (/merchant_accept_timeout/i.test(blob)) {
    return STORE_ACCEPT_TIMEOUT_OPS_REASON;
  }
  if (!isAutoCancellationContext(args)) return null;
  const human = String(args.reason ?? "").trim();
  if (
    human &&
    !/as per policy/i.test(human) &&
    !/^auto cancelled by system/i.test(human) &&
    !/^order cancelled$/i.test(human)
  ) {
    return human;
  }
  return "Auto-cancelled by the system.";
}

export function rewriteAutoCancelLedgerCopy(text: string): string {
  return text
    .replace(/Cancelled by GatiMitra(?: Team)?:\s*Order cancelled/gi, "Auto Cancelled by System")
    .replace(/Cancelled by GatiMitra(?: Team)?/gi, "Auto Cancelled by System")
    .replace(/\bAuto Canceled\b/gi, "Auto Cancelled by System")
    .replace(/Auto Cancelled by System by System/gi, "Auto Cancelled by System");
}

function actorPhrase(brand: string, reason: string): string {
  if (
    brand === "__AUTO__" ||
    /^auto cancel/i.test(brand) ||
    /^auto cancel/i.test(reason)
  ) {
    return "Auto Cancelled by System";
  }
  return reason ? `Cancelled by ${brand}: ${reason}` : `Cancelled by ${brand}`;
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
  const brand = String(meta.cancelled_by_brand ?? GATIMITRA_BRAND).trim() || GATIMITRA_BRAND;
  const reason = String(meta.reason_detail ?? meta.rejected_reason ?? "").trim();
  const auto =
    brand === "__AUTO__" ||
    isAutoCancellationContext({
      cancelledByType: String(meta.cancelled_by_type ?? ""),
      cancelledByLabel: String(meta.cancelled_by_label ?? ""),
      reason,
      triggerSource: String(meta.trigger_source ?? ""),
    });

  if (eligible) {
    const body = auto ? rewriteAutoCancelLedgerCopy(eligible) : eligible;
    return `Order ${orderId} — ${body}`;
  }

  const policyTitle = String(meta.applied_policy_title ?? "").trim();
  const policyDesc = String(meta.applied_policy_description ?? "").trim();
  const pct = Number(meta.compensation_pct ?? 0);
  const reasonPart = auto ? "Auto Cancelled by System" : actorPhrase(brand, reason);

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

