/**
 * Shared "gateway is the source of truth" resolver.
 *
 * Every payment flow that can be left locally unresolved (client callback lost,
 * webhook missing/late, app killed) must be able to ask Razorpay what ACTUALLY
 * happened to a gateway order before it decides the payment's fate. Two flows
 * already do this well — rider negative-wallet (rider-penalty-payment.service)
 * and merchant wallet dues (merchant-wallet-dues-payment.service). This module
 * factors that logic out so the customer checkout reconciler, rider onboarding,
 * and merchant subscription can converge on the SAME rule instead of each
 * re-implementing (or, as customer checkout did, omitting) it.
 *
 * The cardinal rule this enforces:
 *   - A reachable gateway that reports a captured payment  → CAPTURED (recover it)
 *   - A reachable gateway that reports a live attempt      → PENDING (wait, don't fail)
 *   - A reachable gateway that reports nothing captured    → NONE (safe to fail)
 *   - An UNREACHABLE gateway                               → UNREACHABLE (NEVER fail)
 *
 * A temporary network/gateway error must never be turned into a permanent
 * payment failure — that is exactly how captured money "disappears".
 */
import {
  fetchRazorpayOrderPayments,
  type RazorpayOrderPayment,
} from "../../services/payment/razorpayService.js";

export type GatewayTruth =
  /** Gateway confirms a captured payment whose amount matches expectations. */
  | { state: "CAPTURED"; paymentId: string; paidPaise: number }
  /** Gateway confirms a captured payment, but the amount differs from expected. */
  | { state: "AMOUNT_MISMATCH"; paymentId: string; paidPaise: number; expectedPaise: number }
  /** Gateway has a live authorized/created attempt — the user may still complete it. */
  | { state: "PENDING" }
  /** Gateway is reachable and reports NO captured or live attempt — genuinely abandoned. */
  | { state: "NONE" }
  /** Gateway could not be queried (network/timeout/rotated keys) — outcome unknown. */
  | { state: "UNREACHABLE"; reason: string };

/**
 * Pick the authoritative outcome from Razorpay's payment list for an order.
 * Pure — unit-testable without network. A captured payment always wins; among
 * captured payments the first is taken (partial_payment is disabled at order
 * creation, so there is at most one meaningful capture per order).
 */
export function classifyGatewayPayments(
  payments: Array<Pick<RazorpayOrderPayment, "id" | "status" | "amount">>,
  opts: { expectedPaise?: number; amountTolerancePaise?: number } = {}
): GatewayTruth {
  const captured = payments.find((p) => p.status === "captured");
  if (captured) {
    const paidPaise = Number(captured.amount ?? 0);
    const expectedPaise = opts.expectedPaise;
    if (expectedPaise != null && Number.isFinite(expectedPaise)) {
      const tol = Math.max(0, opts.amountTolerancePaise ?? 0);
      if (Math.abs(paidPaise - expectedPaise) > tol) {
        return {
          state: "AMOUNT_MISMATCH",
          paymentId: String(captured.id),
          paidPaise,
          expectedPaise,
        };
      }
    }
    return { state: "CAPTURED", paymentId: String(captured.id), paidPaise };
  }
  const hasLive = payments.some((p) => p.status === "authorized" || p.status === "created");
  if (hasLive) return { state: "PENDING" };
  return { state: "NONE" };
}

/**
 * Ask Razorpay for the authoritative outcome of a gateway order. Never throws —
 * a transient fetch error yields UNREACHABLE so the caller keeps the payment in
 * a retryable state instead of failing it.
 */
export async function resolveGatewayTruth(input: {
  orderId: string;
  expectedPaise?: number;
  amountTolerancePaise?: number;
}): Promise<GatewayTruth> {
  const orderId = input.orderId?.trim() ?? "";
  if (!orderId) return { state: "UNREACHABLE", reason: "missing_order_id" };

  let payments: RazorpayOrderPayment[];
  try {
    payments = await fetchRazorpayOrderPayments(orderId);
  } catch (err) {
    return {
      state: "UNREACHABLE",
      reason: (err as Error)?.message?.slice(0, 300) ?? "gateway_fetch_failed",
    };
  }
  return classifyGatewayPayments(payments, {
    expectedPaise: input.expectedPaise,
    amountTolerancePaise: input.amountTolerancePaise,
  });
}
