/**
 * Refund-log IDs by payment source.
 *
 * Gateway-only → Razorpay / PG refund id (rfnd_…).
 * GatiCash-only → internal RRN (or wallet ledger id).
 * Split (UPI + GatiCash) → both.
 */

const RRN_RE =
  /^RRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
const WEAK_REF_RE = /^(RFND-\d+|WALLET-\d+|GCWR-\d+(-\d+)?)$/i;

function trimRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function isModernRrn(value: string): boolean {
  return RRN_RE.test(value);
}

function isWeakRef(value: string): boolean {
  return WEAK_REF_RE.test(value);
}

/** Razorpay refund ids are `rfnd_…`. Never treat RRN / WALLET / RFND-{n} as gateway. */
export function pickGatewayRefundId(...candidates: unknown[]): string | null {
  const refs = candidates.map(trimRef).filter((v): v is string => Boolean(v));
  const rfnd = refs.find((v) => /^rfnd_/i.test(v));
  if (rfnd) return rfnd;
  for (const v of refs) {
    if (isModernRrn(v) || isWeakRef(v) || /^(WALLET-|GCWR-|GC-)/i.test(v)) continue;
    if (v.length >= 8) return v;
  }
  return null;
}

function pickInternalRefundId(args: {
  refundReference?: string | null;
  customerWalletLedgerId?: number | null;
}): string | null {
  const stored = trimRef(args.refundReference);
  if (stored && isModernRrn(stored)) return stored.toUpperCase();
  const ledger = Number(args.customerWalletLedgerId);
  if (Number.isFinite(ledger) && ledger > 0) return `WALLET-${Math.trunc(ledger)}`;
  if (stored && !isWeakRef(stored) && !/^rfnd_/i.test(stored)) return stored;
  return null;
}

export type RefundLogIdSource = "gaticash" | "gateway";

export type RefundLogIdLine = {
  source: RefundLogIdSource;
  label: string;
  id: string;
  pending: boolean;
};

export type RefundLogIdsInput = {
  refundReference?: string | null;
  razorpayRefundId?: string | null;
  pgRefundId?: string | null;
  customerWalletLedgerId?: number | null;
  splitWalletAmount?: number | null;
  splitRazorpayAmount?: number | null;
  customerWalletAmount?: number | null;
  executionRoute?: string | null;
};

function usedWalletPortion(r: RefundLogIdsInput): boolean {
  const walletAmt = Number(r.splitWalletAmount ?? r.customerWalletAmount ?? 0);
  const route = String(r.executionRoute ?? "").toUpperCase();
  if (walletAmt > 0.005) return true;
  if (route === "WALLET") return true;
  const ledger = Number(r.customerWalletLedgerId);
  if (Number.isFinite(ledger) && ledger > 0 && route !== "RAZORPAY") return true;
  return false;
}

function usedGatewayPortion(r: RefundLogIdsInput, gatewayId: string | null): boolean {
  const gatewayAmt = Number(r.splitRazorpayAmount ?? 0);
  const route = String(r.executionRoute ?? "").toUpperCase();
  if (gatewayAmt > 0.005) return true;
  if (route === "RAZORPAY") return true;
  if (route === "MIXED" && gatewayAmt > 0.005) return true;
  if (gatewayId && route !== "WALLET") return true;
  return false;
}

/**
 * IDs to show in the ops refund log, one line per money pipe that was used.
 */
export function resolveRefundLogIds(r: RefundLogIdsInput): RefundLogIdLine[] {
  const gatewayId = pickGatewayRefundId(r.razorpayRefundId, r.pgRefundId);
  const internalId = pickInternalRefundId(r);
  const route = String(r.executionRoute ?? "").toUpperCase();
  const walletAmt = Number(r.splitWalletAmount ?? r.customerWalletAmount ?? 0);
  const gatewayAmt = Number(r.splitRazorpayAmount ?? 0);

  let showWallet = usedWalletPortion(r);
  let showGateway = usedGatewayPortion(r, gatewayId);

  if (route === "MIXED") {
    showWallet = walletAmt > 0.005 || Boolean(r.customerWalletLedgerId) || showWallet;
    showGateway = gatewayAmt > 0.005 || Boolean(gatewayId) || showGateway;
    if (walletAmt > 0.005) showWallet = true;
    if (gatewayAmt > 0.005) showGateway = true;
  }

  // Gateway-only rows always mint an internal RRN — do not show it as the refund id.
  if (showGateway && !showWallet && route === "RAZORPAY") {
    showWallet = false;
  }
  if (showGateway && !showWallet && gatewayAmt > 0.005 && walletAmt <= 0.005) {
    showWallet = false;
  }

  if (!showWallet && !showGateway) {
    if (gatewayId) showGateway = true;
    else if (internalId) showWallet = true;
  }

  const lines: RefundLogIdLine[] = [];
  if (showWallet) {
    lines.push({
      source: "gaticash",
      label: "GatiCash",
      id: internalId ?? "Pending GatiCash ID",
      pending: !internalId,
    });
  }
  if (showGateway) {
    lines.push({
      source: "gateway",
      label: "Gateway",
      id: gatewayId ?? "Pending Razorpay ID",
      pending: !gatewayId,
    });
  }
  return lines;
}

/** Manual refunds keep the agent email. Auto-cancel system refunds show a fixed label. */
export function refundInitiatedByLabel(r: {
  refundReason?: string | null;
  refundInitiatedBy?: string | null;
  initiatedByEmail?: string | null;
}): string {
  const email = trimRef(r.initiatedByEmail);
  if (email) return email;
  const reason = String(r.refundReason ?? "");
  const autoCancelled =
    /auto\s*cancelled|merchant_accept_timeout|auto[_-\s]?cancel/i.test(reason);
  if (autoCancelled) return "Auto - System";
  return "—";
}

