import "dotenv/config";
import postgres from "postgres";
import { expandCampaignUserIdCandidates } from "../src/modules/notifications/campaignTarget.js";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const IN_APP_ONLY = "__in_app_only__";

async function resolveRiderTokensDryRun(userId: string, ignoreStaleness = true) {
  const candidates = expandCampaignUserIdCandidates(userId);
  const staleExpo = ignoreStaleness
    ? sql``
    : sql`AND (updated_at IS NULL OR updated_at >= now() - interval '90 days')`;
  const staleNative = ignoreStaleness
    ? sql``
    : sql`AND (last_seen_at IS NULL OR last_seen_at >= now() - interval '90 days')`;

  const expo = await sql`
    SELECT user_id, role, LEFT(expo_push_token, 28) AS token_prefix, updated_at
    FROM expo_push_tokens
    WHERE user_id = ANY(${candidates}::text[])
      AND expo_push_token IS NOT NULL
      AND (lower(coalesce(role, 'rider')) = 'rider' OR role IS NULL OR trim(role) = '')
      ${staleExpo}
    ORDER BY updated_at DESC NULLS LAST
  `;
  const native = await sql`
    SELECT user_id, role, platform, source, LEFT(native_token, 16) AS token_prefix, last_seen_at
    FROM native_device_push_tokens
    WHERE user_id = ANY(${candidates}::text[])
      AND token_type = 'fcm'
      AND (lower(coalesce(role, 'rider')) = 'rider' OR role IS NULL OR trim(role) = '')
      ${staleNative}
    ORDER BY last_seen_at DESC NULLS LAST
  `;

  const hasReal =
    (expo as unknown as unknown[]).length > 0 || (native as unknown as unknown[]).length > 0;
  return {
    userId,
    candidates,
    ignoreStaleness,
    wouldResolveTo: hasReal ? "real_tokens" : IN_APP_ONLY,
    expoCount: (expo as unknown as unknown[]).length,
    nativeCount: (native as unknown as unknown[]).length,
    expo,
    native,
  };
}

async function main() {
  const templates = await sql`
    SELECT code, role, channel, priority, enabled, title_template, body_template, deep_link
    FROM notification_templates
    WHERE code IN ('RIDER_DISPATCH_OFFER', 'RIDER_NEW_ORDER', 'MERCHANT_NEW_ORDER')
       OR code ILIKE '%RIDER%ORDER%'
       OR code ILIKE '%DISPATCH%'
    ORDER BY code
  `;
  console.log("=== TEMPLATES ===");
  console.log(JSON.stringify(templates, null, 2));

  const riderNew = (templates as unknown as Array<{ code: string; enabled: boolean }>).find(
    (t) => t.code === "RIDER_NEW_ORDER"
  );
  console.log("=== RIDER_NEW_ORDER CHECK ===");
  console.log(
    JSON.stringify(
      {
        exists: Boolean(riderNew),
        enabled: riderNew?.enabled === true,
        ok: Boolean(riderNew?.enabled),
      },
      null,
      2
    )
  );

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'notification_templates'
    ORDER BY ordinal_position
  `;
  console.log("=== TEMPLATE COLUMNS ===");
  console.log(cols.map((c) => c.column_name).join(", "));

  const logCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'notification_dispatch_logs'
    ORDER BY ordinal_position
  `;
  console.log("=== DISPATCH LOG COLUMNS ===");
  console.log(logCols.map((c) => c.column_name).join(", "));

  const recent = await sql`
    SELECT *
    FROM notification_dispatch_logs
    WHERE queued_at >= now() - interval '7 days'
      AND (
        COALESCE(template_code, '') ILIKE '%RIDER_DISPATCH%'
        OR COALESCE(template_code, '') ILIKE '%RIDER_NEW_ORDER%'
        OR COALESCE(template_code, '') ILIKE '%MERCHANT_NEW_ORDER%'
        OR COALESCE(metadata::text, '') ILIKE '%dispatch_offer%'
      )
    ORDER BY queued_at DESC
    LIMIT 15
  `;
  console.log("=== RECENT DISPATCH LOGS (7d) ===");
  console.log(JSON.stringify(recent, null, 2));

  const tokenSample = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM expo_push_tokens WHERE role = 'rider') AS expo_rider,
      (SELECT COUNT(*)::int FROM expo_push_tokens WHERE role = 'merchant') AS expo_merchant,
      (SELECT COUNT(*)::int FROM native_device_push_tokens WHERE role = 'rider') AS native_rider,
      (SELECT COUNT(*)::int FROM native_device_push_tokens WHERE role = 'merchant') AS native_merchant,
      (SELECT COUNT(*)::int FROM native_device_push_tokens
        WHERE role = 'rider' AND last_seen_at IS NOT NULL AND last_seen_at < now() - interval '90 days') AS rider_native_dormant_90d,
      (SELECT COUNT(*)::int FROM expo_push_tokens
        WHERE role = 'rider' AND updated_at IS NOT NULL AND updated_at < now() - interval '90 days') AS rider_expo_dormant_90d
  `;
  console.log("=== TOKEN COUNTS ===");
  console.log(JSON.stringify(tokenSample, null, 2));

  const sampleRiderTokens = await sql`
    SELECT user_id, role, LEFT(COALESCE(expo_push_token, ''), 24) AS expo_prefix, updated_at
    FROM expo_push_tokens
    WHERE role = 'rider'
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 5
  `;
  console.log("=== SAMPLE RIDER EXPO TOKENS ===");
  console.log(JSON.stringify(sampleRiderTokens, null, 2));

  const sampleNative = await sql`
    SELECT user_id, role, platform, LEFT(native_token, 16) AS token_prefix, last_seen_at, source
    FROM native_device_push_tokens
    WHERE role IN ('rider', 'merchant')
    ORDER BY last_seen_at DESC NULLS LAST
    LIMIT 8
  `;
  console.log("=== SAMPLE NATIVE TOKENS ===");
  console.log(JSON.stringify(sampleNative, null, 2));

  // Dry-run resolve for riders with/without tokens (explains past inbox-only failures).
  const withTokens = await resolveRiderTokensDryRun("usr_1008", true);
  const withoutTokens = await resolveRiderTokensDryRun("usr_1016", true);
  console.log("=== DRY-RUN RESOLVE usr_1008 (expect real tokens) ===");
  console.log(JSON.stringify(withTokens, null, 2));
  console.log("=== DRY-RUN RESOLVE usr_1016 (expect __in_app_only__) ===");
  console.log(JSON.stringify(withoutTokens, null, 2));

  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
