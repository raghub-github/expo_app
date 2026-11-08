/**
 * Post-paid settlement engine — the ONE algorithm that settles a completed
 * Person Ride or Parcel between the customer, the rider and the platform.
 *
 * The two services keep their own fare engines. This module never prices
 * anything; it takes their finalized outputs and decides how money moves:
 *
 *   C = final customer payable      (customer fare engine — the invoice total)
 *   R = final rider entitlement     (rider fare engine — incl. tip + incentives)
 *   P = customer money actually collected (cash in hand, or gateway + GatiCash)
 *
 *   CASH   — the rider is holding the customer's money, so only the DIFFERENCE
 *            moves through the wallet:  wallet Δ = R − C
 *              C > R → wallet DEBIT  (C − R)   platform's share recovered
 *              C < R → wallet CREDIT (R − C)   platform tops the rider up
 *              C = R → no wallet movement      cash collection is still recorded
 *            Measured against C, not P: a rider who under-collects still owes
 *            the full payable, so the shortfall stays with them (unchanged rule
 *            from rideSettlement.math.ts).
 *   ONLINE — the platform holds the customer's money, so the rider is paid R in
 *            full:  wallet CREDIT = R.  A ₹0 payable (100% offer) is the same
 *            path with P = 0 and no gateway capture.
 *
 * C − R is NEVER assumed to be commission. It is split into tax (a liability),
 * tip (rider money, never commissioned), company-funded incentive (an expense)
 * and the residual, which is commission when positive and promotional subsidy
 * when negative. Every result carries a balanced double-entry journal so the
 * split is provable rather than asserted.
 *
 * Pure: integer paise in, integer paise out, no DB, no floats, no rounding
 * inside. Convert at the boundary with toPaise / fromPaise.
 */

export type PostpaidService = "person_ride" | "parcel";
export type PostpaidMethod = "cash" | "online";

export type PostpaidSettlementInput = {
  service: PostpaidService;
  method: PostpaidMethod;
  /** C — invoice total the customer owes after every offer, tax and fee. */
  customerPayablePaise: number;
  /** R — what the rider is owed for this job, including tip and incentives. */
  riderEntitlementPaise: number;
  /** P — what was actually collected (cash) or verified as captured (online). */
  collectedPaise: number;
  /** Of P (online), the part paid from the customer's GatiCash wallet. */
  walletPaidPaise?: number;
  /** Tax inside C. A liability, never rider money. */
  taxPaise?: number;
  /** Customer tip inside R. Never commissioned. */
  tipPaise?: number;
  /**
   * Whether the tip was billed inside C. False when it was paid on its own
   * (e.g. a separate tip payment), in which case it is not part of this
   * invoice and must not look like a subsidy.
   */
  tipIncludedInPayable?: boolean;
  /** Company-funded rider incentive inside R (dynamic / pickup incentive, ...). */
  incentivePaise?: number;
  /** Customer discount already netted out of C. Memo only; it does not move money. */
  discountPaise?: number;
};

export type JournalAccount =
  | "CUSTOMER_RECEIVABLE"
  | "CASH_WITH_RIDER"
  | "GATEWAY_CLEARING"
  | "CUSTOMER_WALLET_LIABILITY"
  | "TIP_CLEARING"
  | "RIDER_PAYABLE"
  | "TIP_PAYABLE"
  | "RIDER_WALLET"
  | "TAX_LIABILITY"
  | "PLATFORM_COMMISSION_REVENUE"
  | "PROMOTIONAL_SUBSIDY_EXPENSE"
  | "RIDER_INCENTIVE_EXPENSE";

export type JournalLine = {
  account: JournalAccount;
  direction: "debit" | "credit";
  amountPaise: number;
};

export type PostpaidSettlementResult = {
  service: PostpaidService;
  method: PostpaidMethod;
  customerPayablePaise: number;
  riderEntitlementPaise: number;
  /** Cash the rider must hold for the customer (cash only; 0 online). */
  cashCollectedPaise: number;
  /** Money the platform received from the customer (online only; 0 cash). */
  platformCollectedPaise: number;
  walletCreditPaise: number;
  walletDebitPaise: number;
  /** Signed wallet change: + credit, − debit. */
  walletDeltaPaise: number;
  taxPaise: number;
  tipPaise: number;
  incentivePaise: number;
  discountPaise: number;
  /** Platform's take on the service itself (residual when positive). */
  platformCommissionPaise: number;
  /** What the platform paid so the rider got R (residual when negative). */
  promotionalSubsidyPaise: number;
  /** Platform result on this job after tax, tip and incentive (signed). */
  platformNetPaise: number;
  /** Online only: payable not yet captured. Always 0 for cash. */
  outstandingPaise: number;
  /** Input inconsistencies that were clamped. Non-empty ⇒ needs reconciliation. */
  warnings: string[];
  journal: JournalLine[];
};

export function toPaise(rupees: unknown): number {
  const n = typeof rupees === "number" ? rupees : Number(rupees);
  if (!Number.isFinite(n)) return 0;
  // DB amounts carry at most 2 decimals, so the float error here is far below 0.5.
  return Math.round(n * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

function nonNegativeInt(value: number | undefined, field: string): number {
  const n = value ?? 0;
  if (!Number.isSafeInteger(n)) {
    throw new Error(`postpaid settlement: ${field} must be an integer number of paise (got ${n})`);
  }
  if (n < 0) {
    throw new Error(`postpaid settlement: ${field} must not be negative (got ${n})`);
  }
  return n;
}

export function computePostpaidSettlement(
  input: PostpaidSettlementInput
): PostpaidSettlementResult {
  if (input.method !== "cash" && input.method !== "online") {
    throw new Error(`postpaid settlement: unknown method ${String(input.method)}`);
  }
  const C = nonNegativeInt(input.customerPayablePaise, "customerPayablePaise");
  const R = nonNegativeInt(input.riderEntitlementPaise, "riderEntitlementPaise");
  const P = nonNegativeInt(input.collectedPaise, "collectedPaise");
  const warnings: string[] = [];

  // Components are clamped rather than rejected: refusing to settle would leave a
  // rider unpaid over a bad snapshot. The clamp is reported so it gets reviewed.
  let T = nonNegativeInt(input.taxPaise, "taxPaise");
  if (T > C) {
    warnings.push(`tax ${T} exceeds payable ${C}; clamped`);
    T = C;
  }
  let tip = nonNegativeInt(input.tipPaise, "tipPaise");
  if (tip > R) {
    warnings.push(`tip ${tip} exceeds rider entitlement ${R}; clamped`);
    tip = R;
  }
  const tipIncluded = input.tipIncludedInPayable !== false;
  if (tipIncluded && tip > C - T) {
    warnings.push(`tip ${tip} exceeds payable net of tax ${C - T}; clamped`);
    tip = C - T;
  }
  let incentive = nonNegativeInt(input.incentivePaise, "incentivePaise");
  if (incentive > R - tip) {
    warnings.push(`incentive ${incentive} exceeds rider base ${R - tip}; clamped`);
    incentive = R - tip;
  }
  const discount = nonNegativeInt(input.discountPaise, "discountPaise");
  let walletPaid = nonNegativeInt(input.walletPaidPaise, "walletPaidPaise");
  if (walletPaid > P) {
    warnings.push(`GatiCash ${walletPaid} exceeds collected ${P}; clamped`);
    walletPaid = P;
  }

  // Residual = customer service revenue (ex tax, ex tip) − rider service earning
  // (ex tip, ex company incentive). Positive is commission; negative is the
  // platform funding a customer offer.
  const customerServiceRevenue = C - T - (tipIncluded ? tip : 0);
  const riderServiceEarning = R - tip - incentive;
  const residual = customerServiceRevenue - riderServiceEarning;
  const commission = Math.max(0, residual);
  const subsidy = Math.max(0, -residual);

  let walletCredit = 0;
  let walletDebit = 0;
  let cashCollected = 0;
  let platformCollected = 0;
  let outstanding = 0;

  if (input.method === "cash") {
    cashCollected = C;
    if (P !== C) {
      warnings.push(`cash collected ${P} differs from payable ${C}; rider is accountable for the payable`);
    }
    if (R >= C) walletCredit = R - C;
    else walletDebit = C - R;
  } else {
    platformCollected = P;
    outstanding = Math.max(0, C - P);
    if (P > C) warnings.push(`captured ${P} exceeds payable ${C}`);
    walletCredit = R;
  }

  const journal: JournalLine[] = [];
  const add = (account: JournalAccount, direction: "debit" | "credit", amountPaise: number) => {
    if (amountPaise > 0) journal.push({ account, direction, amountPaise });
  };

  // 1. Recognise the invoice and the rider's entitlement.
  add("CUSTOMER_RECEIVABLE", "debit", C);
  if (!tipIncluded) add("TIP_CLEARING", "debit", tip);
  add("RIDER_INCENTIVE_EXPENSE", "debit", incentive);
  add("PROMOTIONAL_SUBSIDY_EXPENSE", "debit", subsidy);
  add("TAX_LIABILITY", "credit", T);
  add("TIP_PAYABLE", "credit", tip);
  add("RIDER_PAYABLE", "credit", R - tip);
  add("PLATFORM_COMMISSION_REVENUE", "credit", commission);

  // 2. Collect from the customer.
  if (input.method === "cash") {
    add("CASH_WITH_RIDER", "debit", C);
    add("CUSTOMER_RECEIVABLE", "credit", C);
  } else {
    add("GATEWAY_CLEARING", "debit", P - walletPaid);
    add("CUSTOMER_WALLET_LIABILITY", "debit", walletPaid);
    add("CUSTOMER_RECEIVABLE", "credit", P);
  }

  // 3. Pay the rider.
  add("RIDER_PAYABLE", "debit", R - tip);
  add("TIP_PAYABLE", "debit", tip);
  if (input.method === "cash") {
    add("CASH_WITH_RIDER", "credit", C);
    add("RIDER_WALLET", "debit", walletDebit);
    add("RIDER_WALLET", "credit", walletCredit);
  } else {
    add("RIDER_WALLET", "credit", walletCredit);
  }

  assertJournalBalanced(journal);

  return {
    service: input.service,
    method: input.method,
    customerPayablePaise: C,
    riderEntitlementPaise: R,
    cashCollectedPaise: cashCollected,
    platformCollectedPaise: platformCollected,
    walletCreditPaise: walletCredit,
    walletDebitPaise: walletDebit,
    walletDeltaPaise: walletCredit - walletDebit,
    taxPaise: T,
    tipPaise: tip,
    incentivePaise: incentive,
    discountPaise: discount,
    platformCommissionPaise: commission,
    promotionalSubsidyPaise: subsidy,
    platformNetPaise: residual - incentive,
    outstandingPaise: outstanding,
    warnings,
    journal,
  };
}

export function assertJournalBalanced(journal: JournalLine[]): void {
  let debit = 0;
  let credit = 0;
  for (const line of journal) {
    if (!Number.isSafeInteger(line.amountPaise) || line.amountPaise <= 0) {
      throw new Error(`postpaid settlement: journal line ${line.account} has invalid amount`);
    }
    if (line.direction === "debit") debit += line.amountPaise;
    else credit += line.amountPaise;
  }
  if (debit !== credit) {
    throw new Error(`postpaid settlement: journal unbalanced (debit ${debit} ≠ credit ${credit})`);
  }
}

/** Net movement of one account in a journal: debits − credits. */
export function journalAccountNet(journal: JournalLine[], account: JournalAccount): number {
  let net = 0;
  for (const line of journal) {
    if (line.account !== account) continue;
    net += line.direction === "debit" ? line.amountPaise : -line.amountPaise;
  }
  return net;
}
