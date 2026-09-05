/**
 * Survives process-kill during Razorpay / UPI.
 *
 * Pending orders live on the backend (idempotent create + webhook finalize).
 * This cache only lets the Customer App resume polling after the JS runtime
 * is gone — it is never treated as proof of payment.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@gatimitra/pending_checkout_payment_v1";
/** Backend pending rows expire around 5 minutes; keep a small buffer. */
export const PENDING_CHECKOUT_MAX_AGE_MS = 15 * 60 * 1000;

export type PendingCheckoutPayment = {
  pendingId: string;
  idempotencyKey?: string;
  merchantName?: string;
  amount?: string;
  method?: string;
  deliveryEtaLabel?: string;
  savedAt: number;
};

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
