/**
 * Ride Billing Architecture — Hybrid Residual Take-Rate settlement math.
 *
 * Given a customer bill decomposed into components, compute:
 *   1. commissionable_base (customer bill minus taxes, platform/convenience/
 *      service/gateway fees, company-funded surge, and company-funded
 *      discounts — everything that is not part of the ride service itself).
 *   2. company_commission  = commissionable_base × platform_percentage
 *      (platform_percentage sourced from service_payout_rules — the existing
 *      geo-based rider payout rule already carries the split).
 *   3. rider_earnings      = commissionable_base − company_commission +
 *                            waiting_charge (already customer-charged, kept by
 *                            rider) + surge_customer_share (customer-funded
 *                            surge belongs to the rider).
 *   4. company_receivable  = every company-owned charge + company_commission
 *                            + company_funded surge − company-funded discount.
 *
 * Both cash and online rides use the SAME math — only the wallet postings
 * differ (see rideSettlement.engine.ts):
 *
 *   * Online: company_received = company_receivable (customer paid the full
 *     bill through Razorpay/GatiCash), rider wallet is CREDITED with earnings.
 *   * Cash:   company_received = 0 (customer paid the rider in cash), rider
 *     wallet is DEBITED with company_receivable (the platform's share). The
 *     rider keeps the earnings physically in cash.
 *
 * The math is pure: zero DB access. Callers hydrate `input` from
 * billing_pricing_rules / service_payout_rules / ride_customer_payment_snapshots
 * then feed it here. This keeps the algorithm deterministic and easy to test.
 */

export type PaymentMode = "online" | "cash" | "wallet" | "mixed";

/**
 * ---------------------------------------------------------------------------
 * FUTURE EXTENSION POINTS (Phase 4 documentation, not built here)
 * ---------------------------------------------------------------------------
 *
 * The math engine below is intentionally decomposed so future business models
 * can hook in WITHOUT touching the residual formula. Each extension slot
 * corresponds to a field or an override on `RideBillComponents` /
 * `SettlementInput`:
 *
 *   * CORPORATE BILLING (B2B invoices):
 *     Add `corporateAccountId` + `corporateInvoiceMode` to SettlementInput.
 *     When invoiceMode is `MONTHLY_INVOICE`, the engine sets
 *     `companyReceived = 0` for online rides too (customer defers payment),
 *     and enqueues an invoice ledger line rather than an immediate credit.
 *
 *   * SUBSCRIPTIONS (GMitra Plus, ride passes):
 *     Add `subscriptionDiscount` and `subscriptionPlanId` to components.
 *     Treat like `companyFundedDiscount` — reduces companyReceivable but
 *     leaves rider earnings intact. Keep the plan id for reporting.
 *
 *   * FLEET OWNER / MULTI-LEVEL COMMISSION:
 *     Add `fleetOwnerId` + `fleetTakePercentage` to SettlementInput. Split
 *     `companyCommission` between platform and fleet:
 *       platformCommission = commission × (1 − fleetTakePercentage)
 *       fleetOwnerEarnings = commission × fleetTakePercentage
 *     Ledger writes an extra line to the fleet owner account.
 *
 *   * POLYGON PRICING:
 *     Not a settlement concern — attaches at fare quote time in
 *     rideQuote.service.ts by resolving a polygon `geo_pricing_level` before
 *     the state fallback. Settlement math stays untouched.
 *
 *   * AI DEMAND PRICING:
 *     A new `surge` component with `fundingMode = 'SHARED'` and dynamic
 *     `customerShare` / `companyShare` computed by an ML service. The
 *     Phase 3 surge funding split already exposes the API surface.
 *
 * When wiring a new business model, add its inputs as OPTIONAL fields so old
 * callers stay untouched and default behaviour is preserved.
 * ---------------------------------------------------------------------------
 */

export type RideBillComponents = {
  /** Base fare for pickup (before distance/time components). */
  baseFare?: number;
  /** Distance-based fare. */
  distanceFare?: number;
  /** Waiting charge already charged to the customer (belongs to rider). */
  waitingCharge?: number;
  /**
   * Toll — rider pass-through by default. Customer reimburses the rider;
   * excluded from commissionable base and company receivable unless
   * `commissionOnToll` is enabled on SettlementInput.
   */
  tollCharge?: number;
  /**
   * Night / peak / festival / airport / extra-stops — customer-funded amounts
   * belong entirely to the rider (outside residual split), matching waiting.
   * Company-funded shares (when configured) are rider subsidies that inflate
   * company_receivable.
   */
  nightCharge?: number;
  peakHourCharge?: number;
  festivalCharge?: number;
  airportCharge?: number;
  extraStopsCharge?: number;

  /**
   * Configurable R→P deadhead / pickup incentive (not part of customer P→D
   * fare unless customerShare > 0). Default 0 = residual-only behaviour.
   */
  pickupIncentive?: number;
  pickupIncentiveCustomerShare?: number;
  pickupIncentiveCompanyShare?: number;

  /** Company charges (never part of rider earnings). */
  platformFee?: number;
  convenienceFee?: number;
  serviceCharge?: number;
  gatewayFee?: number;
  smallOrderFee?: number;

  /**
   * Surge funding model (Phase 3 lays the config; math is ready today).
   *   surgeCustomerShare — amount added to the customer bill; belongs to rider.
   *   surgeCompanyShare  — company-absorbed subsidy; NOT added to customer bill
   *                        but IS paid to rider. Company receivable includes it.
   * Default: entire surge_total is customer-funded (surgeCustomerShare) so
   *          existing behaviour is unchanged.
   */
  surgeTotal?: number;
  surgeCustomerShare?: number;
  surgeCompanyShare?: number;

  taxTotal?: number;
  /** Coupon / customer-facing discount already netted from the bill. */
  couponDiscount?: number;
  /**
   * Company-funded discount (marketing subsidy). Rider is still paid on the
   * pre-discount fare; the company absorbs the delta. Treated as a company
   * cost — it REDUCES company_receivable.
   */
  companyFundedDiscount?: number;
  /** Tip belongs to the rider (already outside residual). */
  tipAmount?: number;
};

export type SettlementInput = {
  /**
   * The final customer-payable amount as computed by the existing billing
   * pipeline (executeBillingPipeline). This is the source of truth for
   * customer_bill — components are used for lineage/auditing and to derive the
   * commissionable base.
   */
  customerBill: number;
  paymentMode: PaymentMode;

  /** Amount actually paid by the customer this posting. */
  customerPaid: number;
  /** Split of customerPaid across sources. */
  gatiCashApplied?: number;
  razorpayAmount?: number;
  /** Cash amount collected by the rider (cash / mixed modes). */
  cashCollected?: number;

  /**
   * Effective platform percentage from service_payout_rules for the ride's
   * geo. 0..100. Passed as a percentage (not fraction). If unavailable, the
   * caller SHOULD fall back to the platform default via
   * store_onboarding_commission_config → but the ride settlement engine will
   * still run with 0 (treating 100% of commissionable_base as rider earnings).
   */
  platformPercentage: number;
  /** Snapshot of the rider share so audit rows carry both halves. */
  riderPercentage: number;
  payoutRuleId?: number | null;

  /**
   * When true, toll is treated as a company charge subject to commission.
   * Default false — toll is a full rider pass-through (customer reimburses rider).
   */
  commissionOnToll?: boolean;

  components: RideBillComponents;
};

export type SettlementResult = {
  customerBill: number;
  customerPaid: number;
  paymentMode: PaymentMode;

  /** Sum of the customer-facing charges that fund the platform. */
  companyChargesTotal: number;
  /** Amount that flows through the ride service itself (rider + platform share). */
  commissionableBase: number;
  /** Company's take on the ride service. */
  companyCommission: number;

  /** Total the company must receive for this ride. */
  companyReceivable: number;
  /** Amount the company has actually received in the payment posting. */
  companyReceived: number;

  /** Amount owed to the rider for the ride (their share of the residual). */
  riderEarnings: number;
  /** Signed wallet change (positive = credit, negative = debit). */
  walletDelta: number;
  walletCredit: number;
  walletDebit: number;
  /** Difference between what company must receive and what it has received. */
  outstandingAmount: number;

  /** Passed through for persistence. */
  platformPercentage: number;
  riderPercentage: number;
  payoutRuleId: number | null;

  /** Fully-realised component breakdown (all fields defaulted / clamped). */
  components: Required<
    Pick<
      RideBillComponents,
      | "baseFare"
      | "distanceFare"
      | "waitingCharge"
      | "tollCharge"
      | "nightCharge"
      | "peakHourCharge"
      | "festivalCharge"
      | "airportCharge"
      | "extraStopsCharge"
      | "pickupIncentive"
      | "pickupIncentiveCustomerShare"
      | "pickupIncentiveCompanyShare"
      | "platformFee"
      | "convenienceFee"
      | "serviceCharge"
      | "gatewayFee"
      | "smallOrderFee"
      | "surgeTotal"
      | "surgeCustomerShare"
      | "surgeCompanyShare"
      | "taxTotal"
      | "couponDiscount"
      | "companyFundedDiscount"
      | "tipAmount"
    >
  >;
};

function round2(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function pos(n: number | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return round2(v);
}

function resolveSurgeShares(
  surgeTotal: number,
  customerShare: number | undefined,
  companyShare: number | undefined
): { customer: number; company: number; total: number } {
  const total = pos(surgeTotal);
  // Default = 100% customer-funded so today's behaviour is preserved.
  const hasCustomer = customerShare != null && Number.isFinite(customerShare);
  const hasCompany = companyShare != null && Number.isFinite(companyShare);
  let customer = hasCustomer ? pos(customerShare) : total;
  let company = hasCompany ? pos(companyShare) : 0;
  if (!hasCustomer && hasCompany) customer = Math.max(0, round2(total - company));
  if (hasCustomer && !hasCompany) company = Math.max(0, round2(total - customer));
  // Clamp so components are never negative and never exceed the total.
  customer = Math.min(customer, total);
  company = Math.min(company, Math.max(0, round2(total - customer)));
  return { customer, company, total };
}

/**
 * Hybrid Residual Take-Rate — pure computation. Idempotent given identical
 * inputs. Never mutates arguments.
 */
export function computeRideSettlement(input: SettlementInput): SettlementResult {
  const paymentMode = input.paymentMode;
  const customerBill = pos(input.customerBill);
  const customerPaid = pos(input.customerPaid);
  const commissionOnToll = input.commissionOnToll === true;

  const c: SettlementResult["components"] = {
    baseFare: pos(input.components.baseFare),
    distanceFare: pos(input.components.distanceFare),
    waitingCharge: pos(input.components.waitingCharge),
    tollCharge: pos(input.components.tollCharge),
    nightCharge: pos(input.components.nightCharge),
    peakHourCharge: pos(input.components.peakHourCharge),
    festivalCharge: pos(input.components.festivalCharge),
    airportCharge: pos(input.components.airportCharge),
    extraStopsCharge: pos(input.components.extraStopsCharge),
    pickupIncentive: pos(input.components.pickupIncentive),
    pickupIncentiveCustomerShare: 0,
    pickupIncentiveCompanyShare: 0,
    platformFee: pos(input.components.platformFee),
    convenienceFee: pos(input.components.convenienceFee),
    serviceCharge: pos(input.components.serviceCharge),
    gatewayFee: pos(input.components.gatewayFee),
    smallOrderFee: pos(input.components.smallOrderFee),
    surgeTotal: pos(input.components.surgeTotal),
    surgeCustomerShare: 0,
    surgeCompanyShare: 0,
    taxTotal: pos(input.components.taxTotal),
    couponDiscount: pos(input.components.couponDiscount),
    companyFundedDiscount: pos(input.components.companyFundedDiscount),
    tipAmount: pos(input.components.tipAmount),
  };

  const surge = resolveSurgeShares(
    c.surgeTotal,
    input.components.surgeCustomerShare,
    input.components.surgeCompanyShare
  );
  c.surgeTotal = surge.total;
  c.surgeCustomerShare = surge.customer;
  c.surgeCompanyShare = surge.company;

  const pickup = resolveSurgeShares(
    c.pickupIncentive,
    input.components.pickupIncentiveCustomerShare,
    input.components.pickupIncentiveCompanyShare
  );
  // Default pickup incentive is company-funded (deadhead subsidy) when shares
  // are omitted — customer P→D bill must not silently absorb R→P cost.
  if (
    input.components.pickupIncentiveCustomerShare == null &&
    input.components.pickupIncentiveCompanyShare == null &&
    c.pickupIncentive > 0
  ) {
    c.pickupIncentiveCustomerShare = 0;
    c.pickupIncentiveCompanyShare = c.pickupIncentive;
  } else {
    c.pickupIncentive = pickup.total;
    c.pickupIncentiveCustomerShare = pickup.customer;
    c.pickupIncentiveCompanyShare = pickup.company;
  }

  const platformPct = Math.max(0, Math.min(100, Number(input.platformPercentage) || 0));
  const riderPct = Math.max(0, Math.min(100, Number(input.riderPercentage) || 0));

  // Toll: default rider pass-through. Only join company charges when explicitly
  // configured (future commission_on_toll).
  const tollAsCompany = commissionOnToll ? c.tollCharge : 0;
  const tollAsRiderPassThrough = commissionOnToll ? 0 : c.tollCharge;

  // Rider-side add-ons charged to the customer (outside residual split).
  const riderPassThroughFromCustomer = round2(
    c.waitingCharge +
      c.nightCharge +
      c.peakHourCharge +
      c.festivalCharge +
      c.airportCharge +
      c.extraStopsCharge +
      c.pickupIncentiveCustomerShare +
      tollAsRiderPassThrough
  );

  // Company charges (never part of rider earnings). Toll excluded by default.
  const companyChargesTotal = round2(
    c.platformFee +
      c.convenienceFee +
      c.serviceCharge +
      c.gatewayFee +
      c.smallOrderFee +
      c.taxTotal +
      tollAsCompany
  );

  // commissionable_base = pure trip revenue split between company (commission)
  // and rider (earnings). Waiting / night / airport / toll pass-through / tip /
  // customer-funded surge & pickup incentive belong to the rider and are
  // excluded from the base being split.
  const commissionableBase = round2(
    Math.max(
      0,
      customerBill -
        companyChargesTotal -
        c.surgeCustomerShare -
        riderPassThroughFromCustomer -
        c.tipAmount
    )
  );

  const companyCommission = round2((commissionableBase * platformPct) / 100);

  const riderEarnings = round2(
    Math.max(
      0,
      commissionableBase -
        companyCommission +
        riderPassThroughFromCustomer +
        c.surgeCustomerShare +
        c.surgeCompanyShare +
        c.pickupIncentiveCompanyShare +
        c.tipAmount
    )
  );

  // Company receivable: everything the company is owed for this ride.
  // Company-funded surge / pickup incentive are subsidies paid to the rider
  // and therefore inflate receivable (company "owes" that subsidy out of its
  // share of the bill / wallet recovery).
  const companyReceivable = round2(
    Math.max(
      0,
      companyChargesTotal +
        companyCommission +
        c.surgeCompanyShare +
        c.pickupIncentiveCompanyShare -
        c.companyFundedDiscount
    )
  );

  let companyReceived = 0;
  let walletCredit = 0;
  let walletDebit = 0;

  if (paymentMode === "cash") {
    // Customer paid rider in cash. Company received nothing — recover our
    // share from the rider's wallet. Rider physically keeps their earnings.
    companyReceived = 0;
    walletDebit = companyReceivable;
  } else {
    // Online / wallet / mixed — the customer has paid us the full bill.
    // We owe the rider their earnings; the rest is our net revenue.
    companyReceived = round2(Math.min(customerPaid, companyReceivable));
    walletCredit = riderEarnings;
  }

  const walletDelta = round2(walletCredit - walletDebit);
  const outstandingAmount = round2(Math.max(0, companyReceivable - companyReceived));

  return {
    customerBill,
    customerPaid,
    paymentMode,
    companyChargesTotal,
    commissionableBase,
    companyCommission,
    companyReceivable,
    companyReceived,
    riderEarnings,
    walletDelta,
    walletCredit,
    walletDebit,
    outstandingAmount,
    platformPercentage: platformPct,
    riderPercentage: riderPct,
    payoutRuleId: input.payoutRuleId ?? null,
    components: c,
  };
}
