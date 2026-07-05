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
    customer_compensation: number;
    cancellation_compensation: number;
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
    mechanismFee: number;
    customerCompensation: number;
    deliveredOrderCount: number;
    rejectedOrderCount: number;
    rejectedItemSubtotal?: number;
    rejectedPackagingCharges?: number;
    cancellationCompensation?: number;
    /** Sum of ORDER_EARNING credits — commission already netted; do not subtract mechanism again. */
    merchantNetTotal?: number;
};
//# sourceMappingURL=types.d.ts.map