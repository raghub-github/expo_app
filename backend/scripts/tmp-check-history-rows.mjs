import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const from = "2026-09-27T18:30:00.000Z";
const to = "2026-10-27T18:29:59.999Z";
const rows = await sql`
  SELECT id, order_id, status::text, created_at, cancelled_at
  FROM orders_core
  WHERE merchant_store_id = 94
    AND created_at >= ${from}::timestamptz
    AND created_at <= ${to}::timestamptz
  ORDER BY created_at DESC
`;
console.log(JSON.stringify(rows, null, 2));
await sql.end({ timeout: 2 });
