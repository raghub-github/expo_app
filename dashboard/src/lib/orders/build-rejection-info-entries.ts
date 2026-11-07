/**
 * Shared Rejection Info / cancellation log builder (food + parcel order sidebars).
 */

import {
  dashboardRejectionCancellationDisplay,
  formatRejectionAmount,
  hasOrderCancellationInfo,
  isFaultDebitMetadataLine,
  pickPreferredRefundStatus,
  rejectionAmountsMatch,
  rejectionTimesMatch,
  type OrderCancellationInfo,
} from "@/lib/merchant-cancellation-display";
import {
  classifyRefund,
  orderRefundState,
  type RefundStatusLike,
} from "@/lib/orders/refund-status";
import type { RejectionInfoSideSheetEntry } from "@/app/order/[id]/RejectionInfoSideSheet";

export type RejectionInfoEntry = RejectionInfoSideSheetEntry & {
  atIso?: string | null;
};

export type RejectionRefundRow = RefundStatusLike & {
  id: number;
  refundAmount: string | number | null;
  refundStatus?: string | null;
  refundReason?: string | null;
  refundDescription?: string | null;
  failureReason?: string | null;
  initiatedByEmail?: string | null;
  createdAt?: string | Date | null;
};

function formatRejectionAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function pickRejectionActor(...actors: Array<string | null | undefined>): string | null {
  const list = actors.map((a) => a?.trim()).filter(Boolean) as string[];
  if (list.length === 0) return null;
  const generic = (s: string) =>
    /^super[_\s-]?admin$/i.test(s) || s.toUpperCase() === "SUPER_ADMIN";
  const email = list.find((a) => a.includes("@"));
  if (email) return email;
  const nonGeneric = list.find((a) => !generic(a));
  return nonGeneric ?? list[0];
}

function pickPrimaryRejectionReason(...candidates: Array<string | null | undefined>): string {
  const list = candidates.map((c) => c?.trim()).filter(Boolean) as string[];
  if (list.length === 0) return "Order cancelled";
  const catalogStyle = list.find((t) => !isFaultDebitMetadataLine(t) && t.includes(" - "));
  if (catalogStyle) return catalogStyle;
  const nonMeta = list.find((t) => !isFaultDebitMetadataLine(t));
  return nonMeta ?? list[0];
}

function pickRejectionDetail(
  reason: string,
  ...details: Array<string | null | undefined>
): string | null {
  const reasonNorm = reason.trim().toLowerCase();
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const d of details) {
    const t = d?.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (key === reasonNorm) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(t);
  }
  return lines.length ? lines.join("\n") : null;
}

function shouldMergeRejectionPair(
  cancellation: RejectionInfoEntry & { atIso: string | null },
  refund: RejectionInfoEntry & { atIso: string | null },
  refundCount: number
): boolean {
  if (refundCount === 1) return true;
  return (
    rejectionAmountsMatch(cancellation.amount, refund.amount) &&
    rejectionTimesMatch(cancellation.atIso, refund.atIso)
  );
}

function mergeRejectionPair(
  cancellation: RejectionInfoEntry & { atIso: string | null },
  refund: RejectionInfoEntry & { atIso: string | null }
): RejectionInfoEntry {
  const reason = pickPrimaryRejectionReason(refund.reason, cancellation.reason, cancellation.detail);
  const atIsoPrefer =
    [cancellation.atIso, refund.atIso]
      .filter(Boolean)
      .sort((a, b) => Date.parse(String(b)) - Date.parse(String(a)))[0] ?? null;
  return {
    id: `merged-${refund.id}`,
    kind: "merged",
    reason,
    detail: pickRejectionDetail(
      reason,
      isFaultDebitMetadataLine(cancellation.reason) ? cancellation.reason : null,
      cancellation.detail,
      refund.detail,
      isFaultDebitMetadataLine(refund.reason) ? refund.reason : null
    ),
    source: cancellation.source ?? refund.source,
    by: pickRejectionActor(refund.by, cancellation.by),
    at: cancellation.at !== "—" ? cancellation.at : refund.at,
    atIso: atIsoPrefer,
    rider: cancellation.rider ?? refund.rider,
    amount: cancellation.amount ?? refund.amount,
    status: pickPreferredRefundStatus(cancellation.status, refund.status),
  };
}

function dedupeRejectionEntries(
  cancellation: (RejectionInfoEntry & { atIso: string | null }) | null,
  refunds: Array<RejectionInfoEntry & { atIso: string | null }>
): RejectionInfoEntry[] {
  const out: RejectionInfoEntry[] = [];
  let cancelLeft = cancellation;
  const mergedRefundIds = new Set<string>();

  if (cancelLeft) {
    for (const refund of refunds) {
      if (
        !mergedRefundIds.has(refund.id) &&
        shouldMergeRejectionPair(cancelLeft, refund, refunds.length)
      ) {
        out.push(mergeRejectionPair(cancelLeft, refund));
        mergedRefundIds.add(refund.id);
        cancelLeft = null;
        break;
      }
    }
  }

  if (cancelLeft) out.push(cancelLeft);
  for (const refund of refunds) {
    if (!mergedRefundIds.has(refund.id)) out.push(refund);
  }
  return out;
}

/** Build sorted Rejection Info entries from cancellationInfo + refund rows. */
export function buildRejectionInfoEntries(
  cancellation: OrderCancellationInfo | null | undefined,
  orderRefunds: RejectionRefundRow[] = []
): RejectionInfoEntry[] {
  let cancellationEntry: (RejectionInfoEntry & { atIso: string | null }) | null = null;
  const refundEntries: Array<RejectionInfoEntry & { atIso: string | null }> = [];

  const refundState = orderRefundState(orderRefunds);
  const anyRefundAttempted = orderRefunds.length > 0;

  if (hasOrderCancellationInfo(cancellation)) {
    const display = dashboardRejectionCancellationDisplay(cancellation!);
    const cancellationStatus =
      refundState === "refund_failed"
        ? "REFUND FAILED"
        : refundState === "refunded"
          ? cancellation!.refundStatus?.trim() || "REFUNDED"
          : anyRefundAttempted
            ? "REFUND PENDING"
            : cancellation!.refundStatus?.trim() || null;

    cancellationEntry = {
      id: "cancellation",
      kind: "cancellation",
      reason: display.reason,
      detail:
        refundState === "refund_failed"
          ? [display.detail, "Refund was attempted but rejected — no money returned."]
              .filter(Boolean)
              .join(" · ")
          : display.detail,
      source: display.canceledBy,
      by: display.rejectedBy,
      at: formatRejectionAt(cancellation!.cancelledAtIso),
      atIso: cancellation!.cancelledAtIso ?? null,
      rider: null,
      amount:
        refundState === "refunded"
          ? formatRejectionAmount(cancellation!.refundAmount)
          : null,
      status: cancellationStatus,
    };
  }

  for (const r of orderRefunds) {
    const createdIso =
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt ?? "");
    const outcome = classifyRefund(r);
    refundEntries.push({
      id: `refund-${r.id}`,
      kind: "refund",
      reason: r.refundReason?.trim() || "Refund / cancellation",
      detail:
        outcome === "failed"
          ? [r.refundDescription?.trim(), r.failureReason?.trim()]
              .filter(Boolean)
              .join(" · ") || "Refund failed — no money returned."
          : r.refundDescription?.trim() || null,
      source: null,
      by: r.initiatedByEmail?.trim() || null,
      at: formatRejectionAt(createdIso),
      atIso: createdIso || null,
      rider: null,
      amount: outcome === "settled" ? formatRejectionAmount(r.refundAmount) : null,
      status:
        outcome === "failed"
          ? "FAILED"
          : outcome === "settled"
            ? r.refundStatus?.trim() || "REFUNDED"
            : "PENDING",
    });
  }

  return dedupeRejectionEntries(cancellationEntry, refundEntries).sort((a, b) => {
    const aT = Date.parse(String(a.atIso ?? "")) || 0;
    const bT = Date.parse(String(b.atIso ?? "")) || 0;
    if (aT !== bT) return bT - aT;
    return String(b.id).localeCompare(String(a.id));
  });
}
