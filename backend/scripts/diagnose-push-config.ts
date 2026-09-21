/**
 * READ-ONLY push/FCM diagnostic. Answers the killed-app "nothing happens" question:
 *   1. Is Firebase Admin actually configured + does it initialize? (gates ALL native FCM,
 *      including the data-only control message that starts the full-screen order alert.)
 *   2. Do merchants / riders actually have NATIVE FCM tokens registered? (the control
 *      message is sent ONLY to native FCM tokens — Expo tokens are skipped.)
 *
 * Writes NOTHING. Run on the VPS:
 *   cd /opt/gatimitra && git fetch -q origin diag/push-config \
 *     && git checkout origin/diag/push-config -- backend/scripts/diagnose-push-config.ts \
 *     && cd backend && npx tsx scripts/diagnose-push-config.ts
 */
import { loadEnv } from "../src/config/loadEnv.js";
loadEnv();

import { getEnv } from "../src/config/env.js";
import { isFirebaseAdminConfigured, getFirebaseMessaging } from "../src/config/firebase.js";
import { getSql } from "../src/db/client.js";

async function run() {
  const env = getEnv();

  console.log("\n=== 1) Firebase Admin credentials (gates native FCM send) ===");
  const src =
    (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() && "GOOGLE_APPLICATION_CREDENTIALS(file)") ||
    ((env.FCM_SERVICE_ACCOUNT_JSON || process.env.FCM_SERVICE_ACCOUNT_JSON) && "FCM_SERVICE_ACCOUNT_JSON") ||
    ((env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) && "FIREBASE_{PROJECT_ID,CLIENT_EMAIL,PRIVATE_KEY}") ||
    "(none — will try Application Default Credentials)";
  console.log("  isFirebaseAdminConfigured():", isFirebaseAdminConfigured(env));
  console.log("  credential source:", src);

  console.log("\n=== 2) Does Firebase Admin actually initialize + can it build a message? ===");
  try {
    const messaging = getFirebaseMessaging(env);
    console.log("  getFirebaseMessaging(): OK (Admin app initialized)", !!messaging);
    console.log("  → Native FCM send path is AVAILABLE. If killed-app still fails, the cause is");
    console.log("    device-side (no native token / OEM battery / force-stop), see section 3/4.");
  } catch (e) {
    console.error("  getFirebaseMessaging(): FAILED —", (e as Error).message);
    console.error("  → ROOT CAUSE: backend cannot send native FCM. The data-only control message");
    console.error("    (full-screen alert + looping sound) and native tray push CANNOT be sent, so");
    console.error("    killed-app delivery falls back to Expo only. Set FCM_SERVICE_ACCOUNT_JSON.");
  }

  const sql = getSql();

  console.log("\n=== 3) Native FCM tokens by role (control message targets these ONLY) ===");
  const nativeRows = await sql<{ role: string | null; token_type: string | null; n: number; fresh: number }[]>`
    SELECT lower(coalesce(role,'?')) AS role, coalesce(token_type,'?') AS token_type,
           count(*)::int AS n,
           count(*) FILTER (WHERE last_seen_at IS NULL OR last_seen_at >= now() - interval '30 days')::int AS fresh
    FROM public.native_device_push_tokens
    GROUP BY 1,2 ORDER BY 1,2
  `;
  if (nativeRows.length === 0) console.log("  (NONE) — no native FCM tokens registered at all → killed-app native alert cannot fire.");
  for (const r of nativeRows) console.log(`  ${r.role} / ${r.token_type}: ${r.n} total, ${r.fresh} seen<30d`);

  console.log("\n=== 4) Expo tokens by role (fallback tray only; cannot start native FGS) ===");
  const expoRows = await sql<{ role: string | null; n: number }[]>`
    SELECT lower(coalesce(role,'?')) AS role, count(*)::int AS n
    FROM public.expo_push_tokens GROUP BY 1 ORDER BY 1
  `;
  for (const r of expoRows) console.log(`  ${r.role}: ${r.n}`);

  console.log("\n=== 5) Merchants/riders with an Expo token but NO native FCM token ===");
  console.log("    (these devices get, at best, a passive tray push — never the full-screen alert)");
  const gap = await sql<{ role: string; expo_only_users: number }[]>`
    SELECT lower(e.role) AS role, count(DISTINCT e.user_id)::int AS expo_only_users
    FROM public.expo_push_tokens e
    WHERE lower(e.role) IN ('merchant','rider')
      AND NOT EXISTS (
        SELECT 1 FROM public.native_device_push_tokens n
        WHERE n.user_id = e.user_id AND n.token_type='fcm'
      )
    GROUP BY 1 ORDER BY 1
  `;
  if (gap.length === 0) console.log("  (none — every merchant/rider with an Expo token also has a native FCM token)");
  for (const r of gap) console.log(`  ${r.role}: ${r.expo_only_users} users Expo-only (no native FCM)`);

  console.log("\n=== done ===\n");
  await sql.end({ timeout: 3 }).catch(() => undefined);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
