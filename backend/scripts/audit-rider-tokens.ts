import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  const ids = ["usr_1016", "1016", "GMR1016", "usr_1004", "1004", "GMR1004"];
  const expo = await sql`
    SELECT user_id, role, updated_at
    FROM expo_push_tokens
    WHERE user_id = ANY(${ids})
       OR user_id ILIKE '%1016%'
       OR user_id ILIKE '%1004%'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 30
  `;
  const native = await sql`
    SELECT user_id, role, platform, last_seen_at, source
    FROM native_device_push_tokens
    WHERE user_id = ANY(${ids})
       OR user_id ILIKE '%1016%'
       OR user_id ILIKE '%1004%'
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 30
  `;
  console.log("EXPO", JSON.stringify(expo, null, 2));
  console.log("NATIVE", JSON.stringify(native, null, 2));

  const allRiderNative = await sql`
    SELECT user_id, last_seen_at FROM native_device_push_tokens
    WHERE role = 'rider' ORDER BY last_seen_at DESC NULLS LAST LIMIT 20
  `;
  console.log("ALL_RIDER_NATIVE", JSON.stringify(allRiderNative, null, 2));

  const expand = await sql`
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM expo_push_tokens WHERE role = 'rider'
      UNION
      SELECT user_id FROM native_device_push_tokens WHERE role = 'rider'
    ) t
  `;
  console.log("ALL_RIDER_USER_IDS", expand.map((r) => r.user_id));

  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
