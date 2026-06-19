/**
 * Debug rider food order accept — prints the real DB error.
 * Usage: npx tsx scripts/debug-rider-accept.ts <orderRef> <riderId>
 */
import { acceptOrderForRider } from "../src/modules/rider/rider.orders.service.js";
import { getSql } from "../src/db/client.js";
import { loadEnv } from "../src/config/loadEnv.js";

const orderRef = process.argv[2] ?? "GM10000095";
const riderId = Number(process.argv[3] ?? "1054");

async function main() {
  loadEnv();
  const sql = getSql();

  const rows = await sql<
    Array<{
      id: number;
      order_id: string | null;
      formatted_order_id: string | null;
      rider_id: number | null;
      current_status: string | null;
      food_status: string | null;
    }>
  >`
    SELECT oc.id, oc.order_id, oc.formatted_order_id, oc.rider_id, oc.current_status, of.order_status AS food_status
    FROM orders_core oc
    LEFT JOIN orders_food of ON of.order_id = oc.id
    WHERE oc.order_id = ${orderRef}
       OR oc.formatted_order_id = ${orderRef}
    LIMIT 1
  `;
  console.log("Order snapshot:", rows[0] ?? "NOT FOUND");

  const active = await sql`
    SELECT id, order_core_id, rider_id, assignment_status, is_active
    FROM order_rider_assignments
    WHERE order_core_id = ${rows[0]?.id ?? -1}
    ORDER BY id DESC
    LIMIT 5
  `;
  console.log("Recent assignments:", active);

  try {
    const result = await acceptOrderForRider(riderId, orderRef);
    console.log("ACCEPT OK:", { id: result.id, status: result.status, category: result.category });
  } catch (e) {
    const err = e as Error & { statusCode?: number; code?: string; cause?: unknown };
    console.error("ACCEPT FAILED:");
    console.error("  statusCode:", err.statusCode);
    console.error("  message:", err.message);
    console.error("  code:", err.code);
    if (err.cause) console.error("  cause:", err.cause);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
