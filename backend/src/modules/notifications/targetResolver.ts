/**
 * Resolve a TargetFilter into concrete recipient (user_id, role, device_token, platform) tuples.
 *
 * Token sources:
 *   • expo_push_tokens — primary for all three mobile apps (table 0204)
 *   • merchant_store_push_tokens — store-scoped merchant devices (0128)
 *
 * Notes:
 *   • One user can have multiple tokens (multiple devices). All are returned.
 *   • Expired tokens (last_active > 90 days old) are filtered out automatically.
 *   • Topic subscriptions are checked at send time (Phase 4 will add a
 *     dedicated topic_subscriptions table; for now, topic targets resolve
 *     via FCM topic addressing, not DB lookup).
 */
import { getSql } from "../../db/client.js";
import type {
  NotificationPlatform,
  NotificationRole,
  Recipient,
  TargetFilter,
} from "./types.js";

const TOKEN_STALENESS_DAYS = 90;

type ExpoTokenRow = {
  user_id: string;
  role: string | null;
  device_id: string | null;
  device_type: string | null;
  token: string;
};

function normaliseRole(r: string | null | undefined): NotificationRole {
  const lower = (r ?? "").toLowerCase();
  if (lower === "customer" || lower === "merchant" || lower === "rider" || lower === "admin" || lower === "manager" || lower === "support") {
    return lower;
  }
  return "all";
}

function normalisePlatform(t: string | null | undefined): NotificationPlatform {
  const lower = (t ?? "").toLowerCase();
  if (lower === "ios" || lower === "android" || lower === "web") return lower;
  return "android";
}

/**
 * Look up active expo push tokens for a set of user IDs (role optional filter).
 */
async function tokensForUserIds(
  userIds: string[],
  role?: NotificationRole,
): Promise<Recipient[]> {
  if (userIds.length === 0) return [];
  const sql = getSql();
  // Use parameterised query — never interpolate.
  const rows = (await sql`
    SELECT user_id, role, device_id, device_type, token
    FROM public.expo_push_tokens
    WHERE user_id = ANY(${userIds}::text[])
      AND token IS NOT NULL
      AND last_active_at >= now() - (${TOKEN_STALENESS_DAYS} || ' days')::interval
      ${role && role !== "all" ? sql`AND lower(role) = ${role}` : sql``}
  `) as unknown as ExpoTokenRow[];

  return rows.map((r) => ({
    userId: r.user_id,
    role: normaliseRole(r.role),
    deviceToken: r.token,
    deviceId: r.device_id,
    platform: normalisePlatform(r.device_type),
  }));
}

async function userIdsByRole(role: NotificationRole, filters: { city?: string; zone?: string; status?: string } = {}): Promise<string[]> {
  const sql = getSql();

  if (role === "rider") {
    const rows = (await sql`
      SELECT user_id
      FROM public.rider_profiles
      WHERE user_id IS NOT NULL
        ${filters.status ? sql`AND lower(status) = ${filters.status.toLowerCase()}` : sql``}
    `) as unknown as Array<{ user_id: string }>;
    return rows.map((r) => r.user_id);
  }
  if (role === "merchant") {
    const rows = (await sql`
      SELECT DISTINCT user_id FROM public.merchant_stores
      WHERE user_id IS NOT NULL
        ${filters.status ? sql`AND lower(status) = ${filters.status.toLowerCase()}` : sql``}
    `) as unknown as Array<{ user_id: string }>;
    return rows.map((r) => r.user_id);
  }
  if (role === "customer") {
    const rows = (await sql`
      SELECT user_id FROM public.user_profiles
      WHERE user_id IS NOT NULL
        AND user_id LIKE 'GMC-%'
    `) as unknown as Array<{ user_id: string }>;
    return rows.map((r) => r.user_id);
  }
  if (role === "admin" || role === "manager" || role === "support") {
    const rows = (await sql`
      SELECT user_id FROM public.user_profiles
      WHERE user_id IS NOT NULL
        AND lower(role) = ${role}
    `) as unknown as Array<{ user_id: string }>;
    return rows.map((r) => r.user_id);
  }
  return [];
}

async function userIdsForStore(storeId: number): Promise<string[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT DISTINCT user_id FROM public.merchant_stores
    WHERE id = ${storeId} AND user_id IS NOT NULL
  `) as unknown as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

async function userIdsForOrder(orderId: string): Promise<Array<{ userId: string; role: NotificationRole }>> {
  const sql = getSql();
  // Returns customer + merchant (+ rider if assigned) for an order.
  const rows = (await sql`
    SELECT
      o.customer_id      AS customer_id,
      o.merchant_user_id AS merchant_user_id,
      o.assigned_rider_user_id AS rider_user_id
    FROM public.orders_food o
    WHERE o.order_id = ${orderId}
    LIMIT 1
  `) as unknown as Array<{
    customer_id: string | null;
    merchant_user_id: string | null;
    rider_user_id: string | null;
  }>;
  const out: Array<{ userId: string; role: NotificationRole }> = [];
  for (const r of rows) {
    if (r.customer_id) out.push({ userId: r.customer_id, role: "customer" });
    if (r.merchant_user_id) out.push({ userId: r.merchant_user_id, role: "merchant" });
    if (r.rider_user_id) out.push({ userId: r.rider_user_id, role: "rider" });
  }
  return out;
}

/**
 * Resolve a target filter into concrete delivery recipients.
 */
export async function resolveTarget(target: TargetFilter): Promise<Recipient[]> {
  // 1. Direct device token send (one)
  if ("device_token" in target && target.device_token) {
    return [{
      userId: "__direct__",
      role: "all",
      deviceToken: target.device_token,
      deviceId: null,
      platform: "android",
    }];
  }

  // 1b. Direct device tokens (many) — used by helpers that already looked up
  // tokens from the DB and just want the logging / template benefits.
  if ("device_tokens" in target && Array.isArray(target.device_tokens)) {
    return target.device_tokens.filter((t): t is string => typeof t === "string" && t.length > 0).map((token) => ({
      userId: "__direct__",
      role: "all" as const,
      deviceToken: token,
      deviceId: null,
      platform: "android" as const,
    }));
  }

  // 2. Single user id
  if ("user_id" in target && typeof target.user_id === "string") {
    return tokensForUserIds([target.user_id]);
  }

  // 3. Many user ids
  if ("user_ids" in target && Array.isArray(target.user_ids)) {
    return tokensForUserIds(target.user_ids);
  }

  // 4. Role-based
  if ("role" in target && typeof target.role === "string") {
    const ids = await userIdsByRole(target.role, {
      city: "city" in target ? target.city : undefined,
      zone: "zone" in target ? target.zone : undefined,
      status: "status" in target ? target.status : undefined,
    });
    return tokensForUserIds(ids, target.role);
  }

  // 5. Convenience role buckets
  if ("all_customers" in target && target.all_customers) {
    const ids = await userIdsByRole("customer");
    return tokensForUserIds(ids, "customer");
  }
  if ("all_merchants" in target && target.all_merchants) {
    const ids = await userIdsByRole("merchant");
    return tokensForUserIds(ids, "merchant");
  }
  if ("all_riders" in target && target.all_riders) {
    const ids = await userIdsByRole("rider");
    return tokensForUserIds(ids, "rider");
  }

  // 6. Store-scoped
  if ("store_id" in target && typeof target.store_id === "number") {
    const ids = await userIdsForStore(target.store_id);
    return tokensForUserIds(ids, "merchant");
  }

  // 7. Order-scoped (customer + merchant + assigned rider)
  if ("order_id" in target && typeof target.order_id === "string") {
    const pairs = await userIdsForOrder(target.order_id);
    if (pairs.length === 0) return [];
    const recipientsByRole = await Promise.all(
      (["customer", "merchant", "rider"] as NotificationRole[]).map(async (role) => {
        const ids = pairs.filter((p) => p.role === role).map((p) => p.userId);
        return tokensForUserIds(ids, role);
      }),
    );
    return recipientsByRole.flat();
  }

  // 8. Topic-based (FCM topic delivery — no DB resolution needed)
  if ("topic" in target && typeof target.topic === "string") {
    // Topic is handled by the FCM provider directly via topic addressing.
    // Return a synthetic single recipient marker; the provider knows what to do.
    return [{
      userId: "__topic__",
      role: "all",
      deviceToken: `topic:${target.topic}`,
      deviceId: null,
      platform: "android",
    }];
  }

  return [];
}
