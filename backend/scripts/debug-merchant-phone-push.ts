import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";

loadEnv();
const sql = postgres(getEnv().DATABASE_URL, { max: 1 });

async function main() {
  const expo = await sql`
    SELECT user_id, role, left(expo_push_token, 40) AS tok, device_type, updated_at
    FROM expo_push_tokens
    WHERE user_id IN ('GMMP1010', 'GMMP1001') OR lower(role) = 'merchant'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 20
  `;
  console.log("EXPO", JSON.stringify(expo, null, 2));

  const native = await sql`
    SELECT user_id, role, platform, source, left(native_token, 40) AS tok, last_seen_at
    FROM native_device_push_tokens
    WHERE lower(role) = 'merchant'
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 20
  `;
  console.log("NATIVE", JSON.stringify(native, null, 2));

  const store = await sql`
    SELECT store_id, left(token, 40) AS tok, platform, updated_at
    FROM merchant_store_push_tokens
    WHERE store_id IN (94)
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 10
  `;
  console.log("STORE_TOKENS", JSON.stringify(store, null, 2));

  const logs = await sql`
    SELECT recipient_user_id, platform, channel, status, left(device_token, 36) AS tok,
           error_code, error_message, queued_at
    FROM notification_dispatch_logs
    WHERE campaign_id = 22
    ORDER BY queued_at DESC
    LIMIT 12
  `;
  console.log("C22_LOGS", JSON.stringify(logs, null, 2));

  const { resolveTarget } = await import("../src/modules/notifications/targetResolver.js");
  const r = await resolveTarget({ all_merchants: true });
  console.log(
    "RESOLVED",
    r.map((x) => ({
      userId: x.userId,
      platform: x.platform,
      tok: String(x.deviceToken).slice(0, 28),
    })),
  );

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
