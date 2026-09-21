/**
 * Test the FCM credentials + inject a REAL order push (display notification + full-screen/sound
 * control message) at a specific merchant store or rider — so you can keep the app KILLED and
 * verify sound + popup arrive. Uses the EXACT production push functions.
 *
 * Step 1: dry-run validates the Firebase credentials + each registered native FCM token through
 *         FCM (no delivery) — proves creds/tokens are valid and reports the precise error if not.
 * Step 2: sends the real production order push so the device actually rings.
 *
 * Run on the VPS (target must be logged in on the NEW build, online, notifications allowed):
 *   cd /opt/gatimitra && git fetch -q origin diag/test-order-push \
 *     && git checkout origin/diag/test-order-push -- backend/scripts/test-order-push.ts \
 *     && cd backend
 *   npx tsx scripts/test-order-push.ts merchant <STORE_ID>
 *   npx tsx scripts/test-order-push.ts rider <RIDER_ID> [food|parcel|person_ride]
 *   # add --validate-only to run Step 1 (creds/token check) WITHOUT ringing the device.
 */
import { loadEnv } from "../src/config/loadEnv.js";
loadEnv();

import { getEnv } from "../src/config/env.js";
import { getFirebaseMessaging } from "../src/config/firebase.js";
import { getSql } from "../src/db/client.js";
import { expandCampaignUserIdCandidates } from "../src/modules/notifications/campaignTarget.js";

const role = String(process.argv[2] ?? "").toLowerCase();
const id = Number(process.argv[3]);
const serviceArg = String(process.argv[4] ?? "food").toLowerCase();
const validateOnly = process.argv.includes("--validate-only");

function fail(msg: string): never {
  console.error("ERROR:", msg);
  console.error("Usage: npx tsx scripts/test-order-push.ts <merchant|rider> <id> [service] [--validate-only]");
  process.exit(1);
}

async function riderNativeTokens(riderId: number): Promise<string[]> {
  const sql = getSql();
  const cands = expandCampaignUserIdCandidates(`usr_${riderId}`);
  const rows = await sql<{ t: string }[]>`
    SELECT native_token AS t FROM public.native_device_push_tokens
    WHERE user_id = ANY(${cands}::text[]) AND token_type='fcm'
      AND (lower(coalesce(role,'rider'))='rider' OR role IS NULL OR trim(role)='')
  `;
  return [...new Set(rows.map((r) => String(r.t ?? "").trim()).filter(Boolean))];
}

async function merchantNativeTokens(storeId: number): Promise<string[]> {
  const sql = getSql();
  const { getMerchantStoreNativeFcmTokens } = await import("../src/lib/merchant-push-notify.js");
  return getMerchantStoreNativeFcmTokens(sql, storeId, { ignoreStaleness: true });
}

async function run() {
  if (role !== "merchant" && role !== "rider") fail("first arg must be 'merchant' or 'rider'");
  if (!Number.isFinite(id) || id < 1) fail("second arg must be a numeric id");
  const env = getEnv();
  const messaging = getFirebaseMessaging(env);

  console.log(`\n=== Target: ${role} #${id} ===`);
  const tokens = role === "merchant" ? await merchantNativeTokens(id) : await riderNativeTokens(id);
  console.log(`Native FCM tokens registered: ${tokens.length}`);
  if (tokens.length === 0) {
    console.error(
      "  NO native FCM token for this target → the full-screen/sound alert CANNOT be delivered.\n" +
        "  The user must open the NEW build once (logged in, notifications allowed) so it registers a native token."
    );
  }

  console.log("\n=== Step 1: dry-run validate creds + each token through FCM (no delivery) ===");
  for (const t of tokens) {
    try {
      const msgId = await messaging.send(
        { token: t, data: { gmTest: "1" }, android: { priority: "high" } },
        true // dryRun — validates credentials + token against FCM, sends nothing
      );
      console.log(`  OK  ${t.slice(0, 14)}…  (validated, dryRunId=${msgId})`);
    } catch (e) {
      console.error(`  BAD ${t.slice(0, 14)}…  ${(e as { code?: string }).code ?? ""} ${(e as Error).message}`);
    }
  }

  if (validateOnly) {
    console.log("\n(--validate-only) Skipping the real push. Creds/token check above is the result.\n");
    await getSql().end({ timeout: 3 }).catch(() => undefined);
    return;
  }

  console.log("\n=== Step 2: send the REAL production order push (device should ring now) ===");
  const sql = getSql();
  if (role === "merchant") {
    const { notifyMerchantStoreNewOrderPush } = await import("../src/lib/merchant-push-notify.js");
    await notifyMerchantStoreNewOrderPush(sql, {
      storeId: id,
      title: "🔔 TEST New Order",
      body: "Test order #TEST123 — verify sound + full-screen popup.",
      foodOrderId: null,
      orderIdText: `TEST-${Date.now()}`,
      displayId: "TEST123",
      href: "/(tabs)/",
      itemCount: 1,
      amount: 0,
      customerName: "Test Customer",
    });
    console.log("  Sent merchant new-order push (display + full-screen/sound control).");
  } else {
    const svc = (["food", "parcel", "person_ride"].includes(serviceArg) ? serviceArg : "food") as
      | "food"
      | "parcel"
      | "person_ride";
    const { sendRiderDispatchDirectPush } = await import("../src/lib/rider-dispatch-push.js");
    const res = await sendRiderDispatchDirectPush({
      riderId: id,
      orderId: `TEST-${Date.now()}`,
      serviceType: svc,
      title: "🛵 TEST Order Assignment",
      body: "Test dispatch — verify sound + full-screen popup.",
      data: { test: "1" },
    });
    console.log("  Sent rider dispatch push (display + full-screen/sound control):", JSON.stringify(res));
  }

  console.log(
    "\nWatch the device: with the NEW build installed, logged in, notifications allowed, and\n" +
      "battery-unrestricted, you should get the sound + full-screen order page even when the app\n" +
      "is swiped-killed. Check backend logs for `[fcm] accepted/rejected` and `[dispatch] push_*`.\n"
  );
  await sql.end({ timeout: 3 }).catch(() => undefined);
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
