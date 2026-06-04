import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const searching = await sql`
    SELECT oc.order_id, oc.status, oc.current_status, oc.rider_id, or2.search_expires_at, or2.cancelled_at, or2.ride_type
    FROM orders_core oc
    INNER JOIN orders_ride or2 ON or2.order_id = oc.id
    WHERE oc.order_type = 'person_ride'
      AND oc.status = 'assigned'
      AND oc.rider_id IS NULL
      AND oc.current_status IN ('SEARCHING_RIDER', 'PLACED', 'CREATED')
      AND or2.cancelled_at IS NULL
      AND (or2.search_expires_at IS NULL OR or2.search_expires_at > NOW())
    ORDER BY oc.created_at DESC
    LIMIT 10
  `;
  const recent = await sql`
    SELECT oc.order_id, oc.status, oc.current_status, oc.rider_id, or2.search_expires_at
    FROM orders_core oc
    INNER JOIN orders_ride or2 ON or2.order_id = oc.id
    WHERE oc.order_type = 'person_ride'
    ORDER BY oc.created_at DESC
    LIMIT 5
  `;
  const gm = await sql`
    SELECT oc.order_id, or2.search_expires_at, or2.cancelled_at, NOW() AS now_utc,
      (or2.search_expires_at IS NULL OR or2.search_expires_at > NOW()) AS not_expired
    FROM orders_core oc
    JOIN orders_ride or2 ON or2.order_id = oc.id
    WHERE oc.order_id = 'GM10000070'
  `;
  console.log(JSON.stringify({ searching, recent, gm }, null, 2));
} finally {
  await sql.end();
}
