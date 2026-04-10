/**
 * Charge-order (mixed rules + tax slabs). Execution order is `billing_pricing_rules.charge_order_key`
 * (batch-updated; `priority` is a display hint — not globally unique; see migration 0181).
 */

export type ChargeOrderKey = { kind: "rule" | "tax"; id: number };

/** Coerce API/JSON ids (string, bigint) to integer for stable key compare and SQL. */
export function normalizeChargeOrderId(raw: unknown): number {
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    throw new Error(`Invalid charge-order id: ${String(raw)}`);
  }
  return n;
}

export function normalizeChargeOrderKeys(rows: Array<{ kind: "rule" | "tax"; id: unknown }>): ChargeOrderKey[] {
  return rows.map((r) => ({
    kind: r.kind,
    id: normalizeChargeOrderId(r.id),
  }));
}

export function chargeOrderKeyEquals(a: ChargeOrderKey, b: ChargeOrderKey): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * Browser console + server terminal.
 * - Development: all messages.
 * - Production browser: failures always (warn); other logs if `localStorage.billingChargeDebug=1`.
 * - Server (Route Handlers): failures always via `console.warn` so they are not swallowed.
 */
export function logBillingCharge(where: string, message: string, data?: Record<string, unknown>): void {
  const isDev = process.env.NODE_ENV === "development";
  const isFailure =
    /\b(fail|error|blocked|validation)\b/i.test(message) || data?.err != null || data?.status != null;
  let enabled = isDev;
  if (!enabled && typeof window !== "undefined") {
    try {
      enabled = window.localStorage?.getItem("billingChargeDebug") === "1";
    } catch {
      enabled = false;
    }
  }
  const payload = { where, message, ...data, at: new Date().toISOString() };
  if (isFailure) {
    console.warn("[billing:charge-order]", payload);
    return;
  }
  if (!enabled) return;
  console.info("[billing:charge-order]", payload);
}
