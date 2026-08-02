/**
 * Globally unique customer-facing refund reference numbers (RRN).
 *
 * Format: RRN-{UUID} (uppercase), e.g. RRN-9A7F4C21-8D63-4E2A-B91F-5D7E2A9C1B84
 * Never derived solely from refund row id — suitable for support / copy / reconciliation.
 *
 * Gateway ids (rfnd_…) and legacy WALLET-/GCWR-/RFND-* keys are not modern RRNs.
 */

import { randomUUID } from "node:crypto";

const RRN_RE =
  /^RRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

/** Predictable / placeholder refs that must be replaced by a modern RRN. */
const WEAK_REFUND_REF_RE =
  /^(RFND-\d+|WALLET-\d+|GCWR-\d+(-\d+)?)$/i;

export function generateRefundRrn(): string {
  return `RRN-${randomUUID().toUpperCase()}`;
}

export function isModernRefundRrn(value: unknown): value is string {
  return typeof value === "string" && RRN_RE.test(value.trim());
}

export function isWeakRefundReference(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const t = value.trim();
  if (!t) return true;
  return WEAK_REFUND_REF_RE.test(t);
}

/**
 * Prefer an existing modern RRN; otherwise mint a new one.
 * Does not treat Razorpay `rfnd_*` as the customer RRN — those stay on PG columns.
 */
export function ensureRefundRrn(existing: unknown): string {
  if (isModernRefundRrn(existing)) return String(existing).trim().toUpperCase();
  return generateRefundRrn();
}
