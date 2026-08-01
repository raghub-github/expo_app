/** Avoid showing the same cancellation text twice (label + rejected_reason). */

function normalizeCancellationText(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function cancellationReasonsAreDuplicate(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = normalizeCancellationText(a);
  const nb = normalizeCancellationText(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function merchantCancellationDisplay(args: {
  rejected_reason?: string | null;
  cancelled_by_label?: string | null;
}): {
  headline: string | null;
  detail: string | null;
} {
  const rawReason = (args.rejected_reason ?? '').trim();
  const reason =
    /^merchant_accept_timeout$/i.test(rawReason) || /merchant_accept_timeout/i.test(rawReason)
      ? 'Auto Cancelled'
      : rawReason;
  const labelRaw = (args.cancelled_by_label ?? '').trim();
  const label =
    /^merchant_accept_timeout$/i.test(labelRaw) || /merchant_accept_timeout/i.test(labelRaw)
      ? 'Auto Cancelled'
      : labelRaw;
  if (!reason && !label) return { headline: null, detail: null };
  if (cancellationReasonsAreDuplicate(reason, label)) {
    return { headline: label || reason, detail: null };
  }
  if (reason && label) {
    if (/merchant_accept_timeout/i.test(rawReason)) {
      return { headline: 'Auto Cancelled', detail: null };
    }
    return { headline: label, detail: reason };
  }
  return { headline: reason || label, detail: null };
}

/** Shown on merchant app / partner site timeline and order cards for dashboard cancellations. */
export const GATIMITRA_TEAM_REJECTION_LABEL = "Rejected by GatiMitra Team";

const CATALOG_REASON_RE = /^(CUSTOMER|MERCHANT|RIDER|OTHER)\s-\s/i;

export function isCatalogCancellationReason(reason: string | null | undefined): boolean {
  return CATALOG_REASON_RE.test((reason ?? "").trim());
}

const CANCELLED_BY_TYPE_LABEL: Record<string, string> = {
  store: "Merchant",
  customer: "Customer",
  system: "System",
  rider: "Rider",
  admin: "GatiMitra Team",
};

export function isGatiMitraTeamCancellationLabel(label: string | null | undefined): boolean {
  const t = (label ?? "").trim().toLowerCase();
  return (
    t === GATIMITRA_TEAM_REJECTION_LABEL.toLowerCase() ||
    t === "cancelled by gatimitra team" ||
    t === "rejected by gatimitra team"
  );
}

/** Labels written to orders_food when an agent cancels from the order details page. */
export function dashboardAdminCancellationLabels(rejectedReason: string | null | undefined): {
  cancelledByLabel: string;
  rejectedReason: string | null;
} {
  const reason = (rejectedReason ?? "").trim() || null;
  return {
    cancelledByLabel: GATIMITRA_TEAM_REJECTION_LABEL,
    rejectedReason: reason,
  };
}

export function formatCancelledByType(type: string | null | undefined): string | null {
  const key = (type ?? "").trim().toLowerCase();
  if (!key) return null;
  return CANCELLED_BY_TYPE_LABEL[key] ?? type!.trim();
}

export type OrderCancellationInfo = {
  rejectedReason: string | null;
  cancelledByLabel: string | null;
  cancelledBy: string | null;
  cancelledByType: string | null;
  cancelledAtIso: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  refundStatus: string | null;
  refundAmount: string | null;
  /** e.g. customer_app, website — from order_cancellation_reasons.action_source */
  actionSource?: string | null;
};

/** Dashboard Rejection Info — who initiated cancellation (channel). */
export function formatDashboardCanceledBy(
  cancelledByType: string | null | undefined,
  actionSource?: string | null
): string | null {
  const type = (cancelledByType ?? "").trim().toLowerCase();
  if (type === "customer") {
    const src = (actionSource ?? "").trim().toLowerCase();
    if (src === "customer_app") return "Customer App";
    return "Customer";
  }
  return formatCancelledByType(cancelledByType);
}

/** Dashboard Rejection Info — actor label for "Rejected by". */
export function formatDashboardRejectedBy(
  cancelledByType: string | null | undefined,
  cancelledByRaw: string | null | undefined,
  cancelledByLabel?: string | null
): string | null {
  const type = (cancelledByType ?? "").trim().toLowerCase();
  if (type === "customer") return "User";
  if (type === "store") return "Merchant";
  if (type === "admin") return "GatiMitra Team";
  if (type === "system") return "System";
  if (type === "rider") return "Rider";
  const raw = (cancelledByRaw ?? "").trim().toLowerCase();
  if (raw === "customer") return "User";
  if (raw === "merchant" || raw === "store") return "Merchant";
  if (raw === "system") return "System";
  if (raw === "rider") return "Rider";
  if (raw === "admin" || raw === "agent") return "GatiMitra Team";
  const label = (cancelledByLabel ?? "").trim();
  if (label) return label;
  return cancelledByRaw?.trim() || null;
}

/** Maps stored cancellation rows to dashboard Rejection Info card fields. */
export function dashboardRejectionCancellationDisplay(info: OrderCancellationInfo): {
  reason: string;
  detail: string | null;
  canceledBy: string | null;
  rejectedBy: string | null;
} {
  const type = (info.cancelledByType ?? "").trim().toLowerCase();
  const selectedReason =
    info.rejectedReason?.trim() ||
    info.reasonText?.trim() ||
    info.reasonCode?.trim() ||
    null;

  if (type === "customer") {
    return {
      reason: selectedReason ?? "Order cancelled",
      detail: null,
      canceledBy: formatDashboardCanceledBy(type, info.actionSource),
      rejectedBy: "User",
    };
  }

  const { headline, detail } = merchantCancellationDisplay({
    rejected_reason: info.rejectedReason,
    cancelled_by_label: info.cancelledByLabel,
  });
  const reasonText = info.reasonText?.trim() || null;
  const humanizedCode =
    info.reasonCode?.trim()?.toUpperCase() === "MERCHANT_ACCEPT_TIMEOUT"
      ? "Auto Cancelled"
      : info.reasonCode?.trim() || null;
  const reason =
    headline ||
    reasonText ||
    humanizedCode ||
    (info.rejectedReason?.trim()?.toUpperCase() === "MERCHANT_ACCEPT_TIMEOUT"
      ? "Auto Cancelled"
      : info.rejectedReason?.trim()) ||
    "Order cancelled";
  let detailText = detail;
  if (detailText?.toUpperCase() === "MERCHANT_ACCEPT_TIMEOUT") {
    detailText = null;
  }
  if (!detailText && reasonText && reasonText !== reason && reasonText.toUpperCase() !== "MERCHANT_ACCEPT_TIMEOUT") {
    detailText = reasonText;
  }

  return {
    reason,
    detail: detailText,
    canceledBy:
      formatDashboardCanceledBy(info.cancelledByType, info.actionSource) ||
      info.cancelledByLabel?.trim() ||
      null,
    rejectedBy: formatDashboardRejectedBy(
      info.cancelledByType,
      info.cancelledBy,
      info.cancelledByLabel
    ),
  };
}

export function hasOrderCancellationInfo(info: OrderCancellationInfo | null | undefined): boolean {
  if (!info) return false;
  return Boolean(
    info.rejectedReason?.trim() ||
      info.cancelledByLabel?.trim() ||
      info.cancelledBy?.trim() ||
      info.cancelledByType?.trim() ||
      info.reasonText?.trim() ||
      info.reasonCode?.trim() ||
      info.cancelledAtIso
  );
}

/** True when text is only fault / merchant-debit metadata (not the catalog rejection label). */
export function isFaultDebitMetadataLine(text: string | null | undefined): boolean {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return false;
  if (t.startsWith("fault:") && t.includes("merchant debit:")) return true;
  if (t.startsWith("fault:") && !t.includes(" - ")) return true;
  return false;
}

const REFUND_STATUS_RANK: Record<string, number> = {
  completed: 4,
  complete: 4,
  success: 4,
  processed: 3,
  processing: 2,
  pending: 1,
};

/** Prefer completed/processed over pending when cancellation + refund rows describe the same event. */
export function pickPreferredRefundStatus(
  ...statuses: Array<string | null | undefined>
): string | null {
  let best: string | null = null;
  let bestRank = -1;
  for (const raw of statuses) {
    const s = raw?.trim();
    if (!s) continue;
    const rank = REFUND_STATUS_RANK[s.toLowerCase()] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = s;
    }
  }
  return best;
}

export function formatRejectionAmount(amount: string | number | null | undefined): string | null {
  if (amount == null || amount === "") return null;
  const n = Number(String(amount).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function rejectionAmountsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = a != null ? Number(String(a).replace(/,/g, "")) : NaN;
  const nb = b != null ? Number(String(b).replace(/,/g, "")) : NaN;
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return Math.abs(na - nb) < 0.01;
}

export function rejectionTimesMatch(
  isoA: string | null | undefined,
  isoB: string | null | undefined,
  windowMinutes = 10
): boolean {
  if (!isoA || !isoB) return true;
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return Math.abs(a - b) <= windowMinutes * 60 * 1000;
}
