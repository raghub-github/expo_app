/**
 * Survives process-kill during Razorpay / UPI / wallet settle.
 *
 * Pending orders live on the backend (idempotent create + webhook finalize).
 * This cache only lets the Customer App resume polling after the JS runtime
 * is gone — it is never treated as proof of payment.
 *
 * IMPORTANT lifecycle rules:
 * - Creating a pending order / Razorpay order / showing QR or checkout sheet is
 *   NOT a payment attempt. Do not persist a resume token for those alone.
 * - Persist only after a genuine attempt: UPI app opened, Razorpay success
 *   callback, or wallet-only finalize in flight.
 * - Cold-start must not open "Confirming payment" solely because
 *   `paymentState === pending_confirmation` (that flips when the gateway order
 *   is minted, before the customer pays).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@gatimitra/pending_checkout_payment_v1";
/** Backend pending rows expire around 5 minutes; keep a small buffer. */
export const PENDING_CHECKOUT_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Backend states that mean money may already have moved / capture is in flight.
 * These can resume Confirming even without a local attempt flag (e.g. QR paid
 * via UPI app while our process was dead, then webhook advanced the row).
 */
export const PENDING_CHECKOUT_MONEY_IN_FLIGHT_STATES = new Set([
  "paid",
  "captured_unfinalized",
  "reconciliation_required",
]);

/**
 * Backend states that are "awaiting confirmation" after a gateway session was
 * created. Alone they must NOT resume Confirming — need paymentAttemptInitiated.
 */
export const PENDING_CHECKOUT_AWAITING_ATTEMPT_STATES = new Set([
  "pending_confirmation",
]);

/** Combined set used by the confirming screen to leave when payment never started / failed. */
export const PENDING_CHECKOUT_RESUME_STATES = new Set([
  ...PENDING_CHECKOUT_AWAITING_ATTEMPT_STATES,
  ...PENDING_CHECKOUT_MONEY_IN_FLIGHT_STATES,
]);

/** Backend states where the user never completed a payment attempt (or it ended). */
export const PENDING_CHECKOUT_NO_PAYMENT_STATES = new Set([
  "created",
  "failed",
  "refunded",
  "refund_pending",
  "refund_failed",
]);

export type PendingCheckoutPayment = {
  pendingId: string;
  idempotencyKey?: string;
  merchantName?: string;
  amount?: string;
  method?: string;
  deliveryEtaLabel?: string;
  /**
   * @deprecated Opening Razorpay/QR is not a payment attempt. Prefer
   * `paymentAttemptInitiated`. Kept for parse compatibility with older rows.
   */
  paymentUiOpened?: boolean;
  /**
   * True only after a genuine payment attempt: UPI app launched, Razorpay
   * success callback received, or wallet-only finalize started.
   */
  paymentAttemptInitiated?: boolean;
  savedAt: number;
};

export function shouldResumePendingCheckoutConfirming(
  paymentState: string | null | undefined
): boolean {
  const state = String(paymentState ?? "")
    .trim()
    .toLowerCase();
  if (!state) return false;
  if (PENDING_CHECKOUT_NO_PAYMENT_STATES.has(state)) return false;
  return PENDING_CHECKOUT_RESUME_STATES.has(state);
}

/**
 * Cold-start gate: Confirming payment only when (a) money is already in flight
 * on the backend, or (b) we recorded a genuine local payment attempt AND the
 * backend is still awaiting confirmation.
 */
export function canResumeConfirmingAfterColdStart(
  pending: Pick<PendingCheckoutPayment, "paymentAttemptInitiated" | "paymentUiOpened">,
  paymentState: string | null | undefined
): boolean {
  const state = String(paymentState ?? "")
    .trim()
    .toLowerCase();
  if (!state || PENDING_CHECKOUT_NO_PAYMENT_STATES.has(state)) return false;
  if (PENDING_CHECKOUT_MONEY_IN_FLIGHT_STATES.has(state)) return true;
  if (PENDING_CHECKOUT_AWAITING_ATTEMPT_STATES.has(state)) {
    // Require explicit attempt flag. Do NOT treat legacy paymentUiOpened as
    // an attempt — that was set when the sheet/QR opened (the bug).
    return pending.paymentAttemptInitiated === true;
  }
  return false;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function parsePendingCheckoutPayment(
  raw: unknown,
  now = Date.now()
): PendingCheckoutPayment | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (!isNonEmptyString(rec.pendingId)) return null;
  const savedAt = typeof rec.savedAt === "number" ? rec.savedAt : Number(rec.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > PENDING_CHECKOUT_MAX_AGE_MS) return null;
  return {
    pendingId: rec.pendingId.trim(),
    idempotencyKey: isNonEmptyString(rec.idempotencyKey) ? rec.idempotencyKey.trim() : undefined,
    merchantName: isNonEmptyString(rec.merchantName) ? rec.merchantName.trim() : undefined,
    amount: isNonEmptyString(rec.amount) ? rec.amount.trim() : undefined,
    method: isNonEmptyString(rec.method) ? rec.method.trim() : undefined,
    deliveryEtaLabel: isNonEmptyString(rec.deliveryEtaLabel)
      ? rec.deliveryEtaLabel.trim()
      : undefined,
    paymentUiOpened: rec.paymentUiOpened === true,
    paymentAttemptInitiated: rec.paymentAttemptInitiated === true,
    savedAt,
  };
}

export async function persistPendingCheckoutPayment(
  input: Omit<PendingCheckoutPayment, "savedAt"> & { savedAt?: number }
): Promise<void> {
  const pendingId = input.pendingId?.trim();
  if (!pendingId) return;
  const payload: PendingCheckoutPayment = {
    pendingId,
    idempotencyKey: input.idempotencyKey?.trim() || undefined,
    merchantName: input.merchantName?.trim() || undefined,
    amount: input.amount?.trim() || undefined,
    method: input.method?.trim() || undefined,
    deliveryEtaLabel: input.deliveryEtaLabel?.trim() || undefined,
    paymentUiOpened: input.paymentUiOpened === true,
    paymentAttemptInitiated: input.paymentAttemptInitiated === true,
    savedAt: input.savedAt ?? Date.now(),
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    if (__DEV__) console.warn("[pending-checkout] persist failed", error);
  }
}

export async function peekPendingCheckoutPayment(
  now = Date.now()
): Promise<PendingCheckoutPayment | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = parsePendingCheckoutPayment(JSON.parse(raw), now);
    if (!parsed) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    if (__DEV__) console.warn("[pending-checkout] peek failed", error);
    return null;
  }
}

export async function clearPendingCheckoutPayment(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    if (__DEV__) console.warn("[pending-checkout] clear failed", error);
  }
}
