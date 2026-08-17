/**
 * Client-safe payment detail types (no DB / server-only imports).
 */

import type { OrderDiscountOfferSource } from "@/lib/merchant-billing-discount";

export type OrderPaymentRecord = {
  paymentId: string;
  /** Transaction / Razorpay payment id (pay_…). */
  transactionId: string | null;
  /** GM / Razorpay order id (order_…) — formerly labeled MP. */
  mpTransactionId: string | null;
  paymentStatus: string;
  /** Online vs Cash (COD). */
  paymentMode: string | null;
  /** Instrument / how paid: UPI, QR, Card, Wallet, Pay later, etc. */
  source: string | null;
  refunded: boolean;
  partialRefunded: boolean;
  partiallyRefundedAmount: number | null;
  amount: number | null;
  deliveryFee: number | null;
  /** Customer total (CTC). */
  ctc: number | null;
  /** Amount collected via PG / cash (excluding GatiCash). */
  cashin: number | null;
  /** GatiCash wallet used on this order. */
  gatiCashUsed: number | null;
  /** Merchant amount (CTM) — same SSOT as summary. */
  ctm: number | null;
  /** Taxes / GST charged on the order (CTC bill). */
  taxes: number | null;
  pgName: string | null;
  pgTransactionId: string | null;
};

export type OrderPaymentDetail = {
  totalAmount: number | null;
  /** Merchant-visible bill total (items at merchant prices + packaging − restaurant discount). */
  totalCtm: number | null;
  totalCashbackEarned: number | null;
  /** GatiCash wallet applied (INR). */
  gatiCashUsed: number | null;
  /** Total discount granted to customer on this order. */
  totalDiscountGranted: number | null;
  discountOfferSource: OrderDiscountOfferSource | null;
  /** Display delivery fee (quoted when membership waived; otherwise charged). */
  deliveryFee: number | null;
  /** Pre-benefit quoted fee for strikethrough when membership waived. */
  deliveryFeeQuoted?: number | null;
  /** True when membership benefit made delivery ₹0. */
  deliveryFeeWaived?: boolean;
  /** Taxes / GST on the customer bill. */
  taxes: number | null;
  /** Payment instrument: UPI / QR / Card / Wallet / Pay later / … */
  source: string | null;
  /** Online or Cash. */
  paymentMode: string | null;
  partialRefunded: boolean;
  refundAmount: number | null;
  totalRefunded: number | null;
  totalPaid: number | null;
  records: OrderPaymentRecord[];
};
