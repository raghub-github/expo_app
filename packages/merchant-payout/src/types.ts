/** API / DB snake_case settlement summary — single contract for all surfaces. */
export type MerchantPayoutSettlementSummary = {
  net_order_value: number;
  item_subtotal: number;
  packaging_charges: number;
  restaurant_discounts: number;
  coupon_offer_discount: number;
  percentage_flat_offer_discount: number;
  combo_offer_discount: number;
  free_delivery_offer_discount: number;
  order_deductions: number;
  mechanism_fee: number;
  /** @deprecated Prefer refund_adjustments / penalties; kept for API compat. */
  customer_compensation: number;
  cancellation_compensation: number;
  other_credits: number;
  /** Breakdown of other_credits (ledger category sources). */
  withdrawal_reversal_credits: number;
  manual_credits: number;
  adjustment_credits: number;
  gst_credits: number;
  penalty_reversal_credits: number;
  penalties: number;
  refund_adjustments: number;
  manual_debit_adjustments: number;
  chargebacks: number;
  estimated_payout: number;
  order_count: number;
  delivered_order_count: number;
  rejected_order_count: number;
};

/** Client-facing camelCase view (merchant app, partnersite UI). */
export type MerchantPayoutSettlementClient = {
  netOrderValue: number;
  itemSubtotal: number;
  packagingCharges: number;
  restaurantDiscounts: number;
  couponOfferDiscount: number;
  percentageFlatOfferDiscount: number;
  comboOfferDiscount: number;
  freeDeliveryOfferDiscount: number;
  orderDeductions: number;
  mechanismFee: number;
  customerCompensation: number;
  cancellationCompensation: number;
  otherCredits: number;
  withdrawalReversalCredits: number;
  manualCredits: number;
  adjustmentCredits: number;
  gstCredits: number;
  penaltyReversalCredits: number;
  penalties: number;
  refundAdjustments: number;
  manualDebitAdjustments: number;
  chargebacks: number;
  estimatedPayout: number;
  orderCount: number;
  deliveredOrderCount: number;
  rejectedOrderCount: number;
};

export type SettlementPartsInput = {
  itemSubtotal: number;
  packagingCharges: number;
  couponOfferDiscount: number;
  percentageFlatOfferDiscount: number;
  comboOfferDiscount: number;
  freeDeliveryOfferDiscount: number;
  /** Informational only when merchantNetTotal is post-fee net. Not added into C. */
  mechanismFee: number;
  /** Legacy alias — mapped into refund_adjustments when refundAdjustments omitted. */
  customerCompensation?: number;
  deliveredOrderCount: number;
  rejectedOrderCount: number;
  rejectedItemSubtotal?: number;
  rejectedPackagingCharges?: number;
  cancellationCompensation?: number;
  /** Sum of ORDER_EARNING credits — single source for Net Order Value (A). */
  merchantNetTotal?: number;
  otherCredits?: number;
  withdrawalReversalCredits?: number;
  manualCredits?: number;
  adjustmentCredits?: number;
  gstCredits?: number;
  penaltyReversalCredits?: number;
  penalties?: number;
  refundAdjustments?: number;
  manualDebitAdjustments?: number;
  chargebacks?: number;
  /** When true, include mechanismFee in order deductions C (default false — already in net). */
  includeMechanismFeeInDeductions?: boolean;
};

export type OrderDeductionLine = {
  key: "penalties" | "refund_adjustments" | "manual_debit_adjustments" | "chargebacks" | "mechanism_fee";
  label: string;
  amount: number;
};
