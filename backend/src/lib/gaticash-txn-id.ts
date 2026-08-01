/**
 * Globally unique GatiCash payment transaction references.
 *
 * Format: GC-{UUID} (uppercase), e.g. GC-9A7F4C21-8D63-4E2A-B91F-5D7E2A9C1B84
 * Never derived solely from order id — suitable for audit / support / reconciliation.
 */

import { randomUUID } from "node:crypto";

const GC_TXN_RE =
  /^GC-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;

/** Legacy predictable keys — still recognized for lookups / backfill. */
const LEGACY_GC_TXN_RE = /^(gaticash_|order_gaticash_|ride_gaticash_)/i;

export function generateGatiCashTxnId(): string {
  return `GC-${randomUUID().toUpperCase()}`;
}

export function isGatiCashTxnId(value: unknown): value is string {
  return typeof value === "string" && GC_TXN_RE.test(value.trim());
}

export function isLegacyGatiCashTxnId(value: unknown): boolean {
  return typeof value === "string" && LEGACY_GC_TXN_RE.test(value.trim());
}

/** True when the string is already a production GatiCash txn id (not legacy). */
export function isModernGatiCashTxnId(value: unknown): boolean {
  return isGatiCashTxnId(value);
}

/**
 * Read a previously issued GatiCash txn id from checkout metadata or payment
 * gateway_response (without generating a new one).
 */
export function readStoredGatiCashTxnId(
  source: Record<string, unknown> | null | undefined
): string | null {
  if (!source) return null;
  const direct =
    source.gatiCashTxnId ??
    source.gati_cash_txn_id ??
    source.gatiCashTransactionId ??
    source.gati_cash_transaction_id;
  if (typeof direct === "string" && direct.trim()) {
    const t = direct.trim();
    if (isModernGatiCashTxnId(t) || isLegacyGatiCashTxnId(t)) return t;
  }
  const breakdown =
    source.breakdown && typeof source.breakdown === "object"
      ? (source.breakdown as Record<string, unknown>)
      : null;
  if (breakdown) {
    const nested =
      breakdown.gatiCashTxnId ??
      breakdown.gati_cash_txn_id ??
      breakdown.gatiCashTransactionId;
    if (typeof nested === "string" && nested.trim()) {
      const t = nested.trim();
      if (isModernGatiCashTxnId(t) || isLegacyGatiCashTxnId(t)) return t;
    }
  }
  return null;
}

/**
 * Ensure checkout metadata carries a stable GatiCash txn id for this pending
 * order so finalize + webhook retries share one reference.
 */
export function ensureGatiCashTxnIdInCheckoutMetadata(
  checkoutMetadata: unknown
): { metadata: Record<string, unknown>; gatiCashTxnId: string } {
  const base =
    checkoutMetadata && typeof checkoutMetadata === "object"
      ? { ...(checkoutMetadata as Record<string, unknown>) }
      : {};
  const existing = readStoredGatiCashTxnId(base);
  if (existing && isModernGatiCashTxnId(existing)) {
    return { metadata: base, gatiCashTxnId: existing };
  }
  const gatiCashTxnId = generateGatiCashTxnId();
  return {
    metadata: { ...base, gatiCashTxnId },
    gatiCashTxnId,
  };
}
