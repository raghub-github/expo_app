/**
 * Merchant-facing ledger visibility — keep in sync with
 * packages/merchant-payout/src/walletDisplay.ts (partnersite + merchant app).
 */

export type MerchantLedgerVisibilityEntry = {
  category?: string | null;
  description?: string | null;
  balance_type?: string | null;
  direction?: string | null;
  metadata?: Record<string, unknown> | null;
  reference_id?: number | null;
  reference_type?: string | null;
  formatted_order_id?: string | null;
  order_id?: number | null;
  amount?: number | null;
};

export function isMerchantFacingWithdrawalRequest(
  entry: MerchantLedgerVisibilityEntry,
): boolean {
  const cat = String(entry.category ?? "").trim().toUpperCase();
  if (cat !== "HOLD_LOCK") return false;
  const direction = String(entry.direction ?? "").trim().toUpperCase();
  if (direction && direction !== "DEBIT") return false;
  const balanceType = String(entry.balance_type ?? "").trim().toUpperCase();
  return !balanceType || balanceType === "AVAILABLE" || balanceType === "LOCKED";
}

function payoutStatusFromEntry(entry: MerchantLedgerVisibilityEntry): string {
  const meta = entry.metadata ?? null;
  return String(meta?.payout_status ?? "").trim().toUpperCase();
}

function isInternalHoldLedgerMovement(entry: MerchantLedgerVisibilityEntry): boolean {
  const cat = String(entry.category ?? "").trim().toUpperCase();
  const desc = String(entry.description ?? "").toLowerCase();

  if (isMerchantFacingWithdrawalRequest(entry)) {
    if (payoutStatusFromEntry(entry) === "COMPLETED") return true;
    return false;
  }

  if (cat === "HOLD_LOCK" || cat === "HOLD_RELEASE") return true;

  return (
    desc.includes("withdrawal hold") ||
    desc.includes("release hold") ||
    desc.includes("hold released") ||
    desc.includes("withdrawal requested (processing)")
  );
}

export function isMerchantVisibleLedgerEntry(
  entry: MerchantLedgerVisibilityEntry,
): boolean {
  return !isInternalHoldLedgerMovement(entry);
}

export const LEDGER_CATEGORY_LABELS: Record<string, string> = {
  ORDER_EARNING: "Order Earning",
  ORDER_ADJUSTMENT: "Adjustment",
  WITHDRAWAL: "Withdrawal",
  PENALTY: "Penalty",
  SUBSCRIPTION_FEE: "Subscription",
  COMMISSION_DEDUCTION: "Commission",
  BONUS: "Bonus",
  CASHBACK: "Cashback",
  REFUND_REVERSAL: "Refund Reversal",
  MANUAL_CREDIT: "Manual Credit",
  MANUAL_DEBIT: "Manual Debit",
  ADJUSTMENT: "Adjustment",
  COMPENSATION_CREDIT: "Compensation Credit",
  COMPENSATION_RECOVERY: "Compensation Recovery",
  FAILED_WITHDRAWAL_REVERSAL: "Withdrawal returned",
  HOLD_LOCK: "Withdrawal",
  HOLD_RELEASE: "Withdrawal update",
};

export function resolveLedgerCategoryLabel(entry: {
  category: string;
  metadata?: Record<string, unknown> | null;
}): string {
  const meta = entry.metadata ?? null;
  const txType = String(meta?.transaction_type ?? "").trim().toUpperCase();
  if (txType && LEDGER_CATEGORY_LABELS[txType]) return LEDGER_CATEGORY_LABELS[txType];
  return LEDGER_CATEGORY_LABELS[entry.category] ?? entry.category.replace(/_/g, " ");
}

export type LedgerRowStatusBadge = {
  label: "Settled" | "Pending" | "Hold" | "Rejected" | "Debited" | "Credit" | "Debit" | "Cancelled";
  tone: "emerald" | "amber" | "yellow" | "red" | "slate";
};

/**
 * Merchant-facing Status column — keep in sync with packages/merchant-payout walletDisplay.
 * Original HOLD_LOCK debit stays "Debited" after reject — return credit row is "Rejected".
 */
export function resolveLedgerRowStatusBadge(entry: {
  direction?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown> | null;
  balance_type?: string | null;
}): LedgerRowStatusBadge {
  const meta = entry.metadata ?? null;
  if (
    meta?.entry_type === "order_cancellation" &&
    (meta?.balance_impact === "none" ||
      Number((meta?.cancellation_display as { creditAmount?: number } | undefined)?.creditAmount ?? 1) <= 0)
  ) {
    return { label: "Cancelled", tone: "amber" };
  }

  const cat = String(entry.category ?? "").trim().toUpperCase();
  const payoutStatus = String(meta?.payout_status ?? "").trim().toUpperCase();
  const direction = String(entry.direction ?? "").trim().toUpperCase();

  if (cat === "FAILED_WITHDRAWAL_REVERSAL" || cat === "WITHDRAWAL_REVERSAL") {
    return { label: "Rejected", tone: "red" };
  }

  if (cat === "WITHDRAWAL") {
    if (["REJECTED", "CANCELLED", "FAILED", "RETURNED"].includes(payoutStatus)) {
      return { label: "Debited", tone: "slate" };
    }
    return { label: "Settled", tone: "emerald" };
  }

  if (isMerchantFacingWithdrawalRequest(entry)) {
    if (["APPROVED", "PROCESSING", "HOLD"].includes(payoutStatus)) {
      return { label: "Hold", tone: "yellow" };
    }
    if (["REJECTED", "CANCELLED", "FAILED", "RETURNED"].includes(payoutStatus)) {
      return { label: "Debited", tone: "slate" };
    }
    if (payoutStatus === "COMPLETED") {
      return { label: "Settled", tone: "emerald" };
    }
    return { label: "Pending", tone: "amber" };
  }

  if (direction === "CREDIT") return { label: "Credit", tone: "emerald" };
  return { label: "Debit", tone: "red" };
}

/** Clean merchant-facing copy for withdrawal reject / fail credits. */
export function resolveWithdrawalReversalDisplayDescription(
  raw: string | null | undefined,
  metadata?: Record<string, unknown> | null,
): string {
  const reason = String(metadata?.rejection_reason ?? metadata?.reason ?? "").trim();
  const desc = (raw ?? "").trim();

  let base = "Withdrawal rejected — funds returned to your wallet.";
  if (/withdrawal failed/i.test(desc) || (/funds released/i.test(desc) && !/rejected/i.test(desc))) {
    base = "Withdrawal failed — funds returned to your wallet.";
  } else if (desc && !/funds returned to wallet|FAILED_WITHDRAWAL_REVERSAL/i.test(desc)) {
    const cleaned =
      desc.replace(/\s*#\d+\b/g, "").replace(/\s{2,}/g, " ").trim() || base;
    if (/reason\s*:/i.test(cleaned)) return cleaned;
    base = cleaned;
  }

  if (reason) {
    return `${base.replace(/\.$/, "")}. Reason: ${reason}`;
  }
  return base;
}

/** Remarks for merchant-facing withdrawal request (HOLD_LOCK AVAILABLE debit) row. */
export function resolveWithdrawalRequestDisplayDescription(
  entry: MerchantLedgerVisibilityEntry,
): string {
  const status = payoutStatusFromEntry(entry);
  const meta = entry.metadata ?? null;
  const holdReason = String(
    meta?.hold_reason ?? meta?.approval_notes ?? meta?.hold_notes ?? "",
  ).trim();

  if (["APPROVED", "PROCESSING", "HOLD"].includes(status)) {
    return holdReason
      ? `Withdrawal on hold — ${holdReason}`
      : "Withdrawal on hold — awaiting release by admin.";
  }
  if (["REJECTED", "CANCELLED", "FAILED", "RETURNED"].includes(status)) {
    return "Withdrawal debited from your wallet.";
  }
  if (status === "COMPLETED") {
    return "Funds have been successfully transferred to the registered bank account.";
  }
  return "Withdrawal requested — funds held from your wallet.";
}

/** True for admin manual wallet credit/debit ledger rows. */
export function isManualWalletAdjustmentLedgerEntry(entry: {
  category?: string | null;
  description?: string | null;
}): boolean {
  const cat = String(entry.category ?? "").trim().toUpperCase();
  if (cat === "MANUAL_CREDIT" || cat === "MANUAL_DEBIT") return true;
  return /^Manual (credit|debit):/i.test(String(entry.description ?? "").trim());
}

/** Merchant-facing manual credit/debit copy — hide internal request ids. */
export function resolveManualWalletAdjustmentDisplayDescription(
  raw: string | null | undefined,
): string {
  let desc = String(raw ?? "").trim();
  if (!desc) return desc;
  return desc
    .replace(/\s*\(request\s*(?:#\d+|ID unavailable)\)\s*/gi, "")
    .replace(/\s*\(request\s*#\d+\)\s*/gi, "")
    .replace(/\s*\(request ID unavailable\)\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const WITHDRAWAL_COMPLETED_DESCRIPTION =
  "Funds have been successfully transferred to the registered bank account.";

function resolveLedgerFormattedOrderId(
  entry: MerchantLedgerVisibilityEntry,
  meta: Record<string, unknown> | null,
): string | null {
  const fromEntry = String(entry.formatted_order_id ?? "").trim();
  if (fromEntry) return fromEntry.replace(/^#/, "");
  const fromMeta = String(meta?.formatted_order_id ?? "").trim();
  if (fromMeta) return fromMeta.replace(/^#/, "");
  return null;
}

/** Full merchant-facing Description column — parity with partnersite. */
export function resolveLedgerDisplayDescription(
  entry: MerchantLedgerVisibilityEntry,
): string {
  const meta = (entry.metadata ?? null) as Record<string, unknown> | null;
  const rawDesc = entry.description?.trim() ?? "";

  if (isManualWalletAdjustmentLedgerEntry(entry)) {
    return resolveManualWalletAdjustmentDisplayDescription(rawDesc);
  }

  const desc = rawDesc;

  if (String(entry.category ?? "").toUpperCase() === "FAILED_WITHDRAWAL_REVERSAL") {
    return resolveWithdrawalReversalDisplayDescription(desc, meta);
  }

  if (isMerchantFacingWithdrawalRequest(entry)) {
    return resolveWithdrawalRequestDisplayDescription(entry);
  }

  if (
    String(entry.category ?? "").toUpperCase() === "HOLD_LOCK" ||
    String(entry.category ?? "").toUpperCase() === "HOLD_RELEASE" ||
    /withdrawal hold|release hold|hold released/i.test(desc)
  ) {
    return (
      desc
        .replace(/\s*#\d+\b/g, "")
        .replace(/\(hold bucket\)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim() || "Withdrawal update"
    );
  }

  if (/^Withdrawal completed #\d+$/i.test(desc)) {
    return WITHDRAWAL_COMPLETED_DESCRIPTION;
  }

  if (/withdrawal|funds returned|release hold|hold released|payout/i.test(desc)) {
    return desc
      .replace(/\s*#\d+\b/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  if (meta?.entry_type === "order_cancellation") {
    const eligible = String(meta.eligible_message ?? "").trim();
    if (eligible) {
      const orderId = resolveLedgerFormattedOrderId(entry, meta);
      if (orderId && !eligible.toLowerCase().includes(orderId.toLowerCase())) {
        return `Order ${orderId} — ${eligible}`;
      }
      if (/no merchant credit/i.test(desc) || !desc) return eligible;
    }
    if (/no merchant credit/i.test(desc)) {
      const policy = String(meta.applied_policy_title ?? "").trim();
      const reason = String(
        meta.reason_detail ?? meta.rejected_reason ?? meta.food_rejected_reason ?? "",
      ).trim();
      const brand = String(meta.cancelled_by_brand ?? "GatiMitra").trim();
      const orderId = resolveLedgerFormattedOrderId(entry, meta) ?? "Order";
      const reasonPart = reason ? `Cancelled by ${brand}: ${reason}` : `Cancelled by ${brand}`;
      const why = policy
        ? `No compensation — ${policy}`
        : "No compensation as per cancellation policy";
      return `Order ${orderId} · ${reasonPart}. ${why}`;
    }
  }

  return desc;
}

export type LedgerAmountDisplay = {
  text: string;
  accent: "credit" | "debit" | "neutral";
  compensationPolicy?: { orderCtm: number; receivedAmount: number };
};

/** Amount column — basic parity with partnersite (compensation strike-through when present). */
export function resolveLedgerDisplayAmount(
  entry: MerchantLedgerVisibilityEntry,
  formatMoney: (n: number) => string,
): LedgerAmountDisplay {
  const meta = entry.metadata ?? null;
  if (meta?.entry_type === "order_cancellation" && meta?.balance_impact === "none") {
    return { text: formatMoney(0), accent: "neutral" };
  }
  const cancelDisplay = meta?.cancellation_display as
    | { orderCtm?: number; creditAmount?: number; originalAmount?: number }
    | undefined;
  if (cancelDisplay && Number(cancelDisplay.creditAmount ?? NaN) >= 0) {
    const received = Number(cancelDisplay.creditAmount ?? 0);
    const orderCtm = Number(cancelDisplay.orderCtm ?? cancelDisplay.originalAmount ?? 0);
    if (orderCtm > 0 || received >= 0) {
      return {
        text: received > 0 ? `+${formatMoney(received)}` : formatMoney(0),
        accent: received > 0 ? "credit" : "neutral",
        compensationPolicy: { orderCtm, receivedAmount: received },
      };
    }
  }
  const isCredit = String(entry.direction ?? "").toUpperCase() === "CREDIT";
  const amount = Number(entry.amount ?? 0);
  return {
    text: `${isCredit ? "+" : "−"}${formatMoney(amount)}`,
    accent: isCredit ? "credit" : "debit",
  };
}

/** Attach payout_status from request id (WITHDRAWAL / HOLD_LOCK with reference_id). */
export function enrichLedgerEntriesWithPayoutStatus<
  T extends MerchantLedgerVisibilityEntry & { reference_id?: number | null },
>(
  entries: T[],
  statusByRequestId: Map<number, string>,
): T[] {
  return entries.map((entry) => {
    const reqId = Number(entry.reference_id);
    if (!Number.isFinite(reqId) || reqId <= 0) return entry;
    const status = statusByRequestId.get(reqId);
    if (!status) return entry;
    const meta = { ...(entry.metadata ?? {}), payout_status: status };
    return { ...entry, metadata: meta };
  });
}

/** Link HOLD_LOCK rows via payout hold_ledger_id (reference_id is often 0 at request time). */
export function enrichLedgerEntriesWithHoldPayoutLinks<
  T extends MerchantLedgerVisibilityEntry & {
    id: number;
    reference_id?: number | null;
  },
>(
  entries: T[],
  byHoldLedgerId: Map<
    number,
    { id: number; status: string; hold_reason?: string | null }
  >,
): T[] {
  return entries.map((entry) => {
    const cat = String(entry.category ?? "").trim().toUpperCase();
    if (cat !== "HOLD_LOCK") return entry;
    const linked = byHoldLedgerId.get(Number(entry.id));
    if (!linked) return entry;
    const refOk = entry.reference_id != null && Number(entry.reference_id) > 0;
    const holdReason = String(linked.hold_reason ?? "").trim();
    return {
      ...entry,
      reference_id: refOk ? entry.reference_id : linked.id,
      metadata: {
        ...(entry.metadata ?? {}),
        payout_request_id: linked.id,
        payout_status: linked.status,
        ...(holdReason ? { hold_reason: holdReason } : {}),
      },
    };
  });
}
