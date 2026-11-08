/**
 * Parcel settlement RECONCILER (safety net).
 *
 * A parcel settles from creditRiderOrderEarningOnDelivered, which the delivery
 * flow fires without awaiting. If that call fails (DB blip, deploy restart), the
 * rider is never settled and nothing retries it. This pass finds recently
 * delivered, paid parcels that have no settlement row and re-runs the same
 * idempotent credit/settlement — it can never post twice (settlement row is
 * unique per order, wallet refs are unique per rider).
 */
import { withLock } from "@gatimitra/redis";
import { getSql } from "../db/client.js";

const LOCK_KEY = "tick:parcel-settlement-reconciler";
const LOCK_TTL_MS = 110_000;
const INTERVAL_MS = 120_000;
/** Give the inline settlement time to finish before treating it as missed. */
const MIN_AGE = "3 minutes";
const LOOKBACK = "72 hours";

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function reconcileUnsettledParcelsOnce(): Promise<{ checked: number; settled: number }> {
  const sql = getSql();
  const rows = await sql<Array<{ id: string | number; rider_id: number; order_id: string | null }>>`
    SELECT c.id, c.rider_id, c.order_id
    FROM orders_core c
    JOIN orders_parcel p ON p.order_id = c.id
    WHERE c.order_type = 'parcel'
      AND c.status = 'delivered'
      AND c.rider_id IS NOT NULL
      AND lower(c.payment_status::text) IN ('completed', 'paid', 'captured')
      AND c.updated_at < now() - ${MIN_AGE}::interval
      AND c.updated_at > now() - ${LOOKBACK}::interval
      AND NOT EXISTS (SELECT 1 FROM ride_settlements s WHERE s.order_core_id = c.id)
    ORDER BY c.updated_at
    LIMIT 25
  `;
  if (rows.length === 0) return { checked: 0, settled: 0 };

  const { creditRiderOrderEarningOnDelivered } = await import("./credit-rider-order-on-delivered.js");
  let settled = 0;
  for (const r of rows) {
    try {
      const res = await creditRiderOrderEarningOnDelivered({
        ordersCoreId: Number(r.id),
        riderId: Number(r.rider_id),
        orderType: "parcel",
        orderIdText: r.order_id,
      });
      if (res.credited) settled += 1;
      else if (res.error) {
        console.warn(`[parcel-settlement-reconciler] order ${r.id} not settled: ${res.error}`);
      }
    } catch (err) {
      console.warn(`[parcel-settlement-reconciler] order ${r.id} failed:`, (err as Error).message);
    }
  }
  return { checked: rows.length, settled };
}

async function pollOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await withLock(LOCK_KEY, LOCK_TTL_MS, async () => {
      const { checked, settled } = await reconcileUnsettledParcelsOnce();
      if (checked > 0) {
        console.info(`[parcel-settlement-reconciler] checked ${checked}, settled ${settled}`);
      }
    });
  } finally {
    running = false;
  }
}

export async function startParcelSettlementReconciler(): Promise<void> {
  if (timer) return;
  timer = setInterval(() => {
    void pollOnce().catch((e) =>
      console.warn("[parcel-settlement-reconciler] poll error", (e as Error).message)
    );
  }, INTERVAL_MS);
  if (timer.unref) timer.unref();
}

export function stopParcelSettlementReconciler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
