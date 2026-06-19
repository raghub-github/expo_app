import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1 });

try {
  const cols = await sql`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rider_payment_methods'
    ORDER BY ordinal_position
  `;
  console.log("columns:", cols);

  const sample = await sql`
    SELECT id, rider_id, method_type, deleted_at
    FROM rider_payment_methods
    WHERE rider_id = 1052
    LIMIT 1
  `;
  const enums = await sql`
    SELECT e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname IN ('payment_method_verification_status', 'verification_proof_type')
    ORDER BY t.typname, e.enumsortorder
  `;
  console.log("other enum values:", enums);
} catch (err) {
  console.error("query failed:", err);
} finally {
  await sql.end();
}
