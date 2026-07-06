/**
 * Resolve a TargetFilter into concrete recipient (user_id, role, device_token, platform) tuples.
 *
 * Token sources:
 *   • expo_push_tokens — customer / rider apps (and legacy merchant rows)
 *   • merchant_store_push_tokens — merchant app devices per store (0128)
 */
import { getSql } from "../../db/client.js";
import type {
  NotificationPlatform,
  NotificationRole,
  Recipient,
  TargetFilter,
} from "./types.js";

const TOKEN_STALENESS_DAYS = 90;

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

function dedupeByToken(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of recipients) {
    if (!r.deviceToken || seen.has(r.deviceToken)) continue;
    seen.add(r.deviceToken);
    out.push(r);
  }
  return out;
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
  const rows = (await sql`
    SELECT user_id, role, device_type, expo_push_token AS token
    FROM public.expo_push_tokens
    WHERE user_id = ANY(${userIds}::text[])
      AND expo_push_token IS NOT NULL
      AND (updated_at IS NULL OR updated_at >= now() - (${TOKEN_STALENESS_DAYS} || ' days')::interval)
      ${role && role !== "all" ? sql`AND lower(role) = ${role}` : sql``}
  `) as unknown as Array<{
    user_id: string;
    role: string | null;
    device_type: string | null;
    token: string;
  }>;

  return rows.map((r) => ({
    userId: r.user_id,
    role: normaliseRole(r.role),
    deviceToken: r.token,
    deviceId: null,
    platform: normalisePlatform(r.device_type),
  }));
}

/** Merchant app registers Expo tokens per store — not in expo_push_tokens. */
async function tokensFromMerchantStorePushTokens(opts: {
  storeIds?: number[];
  parentMerchantIds?: string[];
  allStores?: boolean;
}): Promise<Recipient[]> {
  const sql = getSql();
  const storeIds = opts.storeIds?.filter((id) => Number.isFinite(id) && id > 0) ?? [];
  const parentMerchantIds =
    opts.parentMerchantIds?.map((id) => id.trim()).filter(Boolean) ?? [];

  let rows: Array<{
    token: string;
    platform: string | null;
    parent_merchant_id: string | null;
    store_id: number;
  }>;

  if (storeIds.length > 0) {
    rows = (await sql`
      SELECT mspt.token, mspt.platform, mp.parent_merchant_id, mspt.store_id
      FROM public.merchant_store_push_tokens mspt
      INNER JOIN public.merchant_stores ms ON ms.id = mspt.store_id AND ms.deleted_at IS NULL
      INNER JOIN public.merchant_parents mp ON mp.id = ms.parent_id
      WHERE mspt.store_id = ANY(${storeIds}::bigint[])
    `) as unknown as typeof rows;
  } else if (parentMerchantIds.length > 0) {
    rows = (await sql`
      SELECT mspt.token, mspt.platform, mp.parent_merchant_id, mspt.store_id
      FROM public.merchant_store_push_tokens mspt
      INNER JOIN public.merchant_stores ms ON ms.id = mspt.store_id AND ms.deleted_at IS NULL
      INNER JOIN public.merchant_parents mp ON mp.id = ms.parent_id
      WHERE mp.parent_merchant_id = ANY(${parentMerchantIds}::text[])
    `) as unknown as typeof rows;
  } else if (opts.allStores) {
    rows = (await sql`
      SELECT mspt.token, mspt.platform, mp.parent_merchant_id, mspt.store_id
      FROM public.merchant_store_push_tokens mspt
      INNER JOIN public.merchant_stores ms ON ms.id = mspt.store_id AND ms.deleted_at IS NULL
      INNER JOIN public.merchant_parents mp ON mp.id = ms.parent_id
    `) as unknown as typeof rows;
  } else {
    return [];
  }

  return rows
    .filter((r) => r.token)
    .map((r) => ({
      userId: r.parent_merchant_id ?? `store:${r.store_id}`,
      role: "merchant" as const,
      deviceToken: r.token,
      deviceId: null,
      platform: normalisePlatform(r.platform),
    }));
}

async function merchantRecipients(opts: {
  storeIds?: number[];
  parentMerchantIds?: string[];
  allStores?: boolean;
}): Promise<Recipient[]> {
  const storeTokens = await tokensFromMerchantStorePushTokens(opts);
  let parentIds = opts.parentMerchantIds ?? [];
  if (!parentIds.length && opts.storeIds?.length) {
    const nested = await Promise.all(opts.storeIds.map((id) => userIdsForStore(id)));
    parentIds = [...new Set(nested.flat())];
  }
  const expoRecipients = parentIds.length
    ? await tokensForUserIds(parentIds, "merchant")
    : opts.allStores
      ? await tokensForUserIds(await userIdsByRole("merchant"), "merchant")
      : [];
  return dedupeByToken([...storeTokens, ...expoRecipients]);
}

async function userIdsByRole(role: NotificationRole, _filters: { city?: string; zone?: string; status?: string } = {}): Promise<string[]> {
  const sql = getSql();
  if (role === "rider" || role === "merchant" || role === "customer" || role === "admin" || role === "manager" || role === "support") {
    const rows = (await sql`
      SELECT DISTINCT user_id FROM public.expo_push_tokens
      WHERE user_id IS NOT NULL
        AND lower(role) = ${role}
        AND (updated_at IS NULL OR updated_at >= now() - (${TOKEN_STALENESS_DAYS} || ' days')::interval)
    `) as unknown as Array<{ user_id: string }>;
    return rows.map((r) => r.user_id);
  }
  return [];
}

async function userIdsForStore(storeId: number): Promise<string[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT DISTINCT mp.parent_merchant_id AS user_id
    FROM public.merchant_stores s
    INNER JOIN public.merchant_parents mp ON mp.id = s.parent_id
    WHERE s.id = ${storeId}
      AND s.deleted_at IS NULL
      AND mp.parent_merchant_id IS NOT NULL
  `) as unknown as Array<{ user_id: string }>;
  return rows.map((r) => r.user_id);
}

async function userIdsForOrder(orderId: string): Promise<Array<{ userId: string; role: NotificationRole }>> {
  const sql = getSql();
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
  if ("device_token" in target && target.device_token) {
    return [{
      userId: "__direct__",
      role: "all",
      deviceToken: target.device_token,
      deviceId: null,
      platform: "android",
    }];
  }

  if ("device_tokens" in target && Array.isArray(target.device_tokens)) {
    return target.device_tokens.filter((t): t is string => typeof t === "string" && t.length > 0).map((token) => ({
      userId: "__direct__",
      role: "all" as const,
      deviceToken: token,
      deviceId: null,
      platform: "android" as const,
    }));
  }

  if ("user_id" in target && typeof target.user_id === "string") {
    const uid = target.user_id.trim();
    const expo = await tokensForUserIds([uid]);
    const merchant = await tokensFromMerchantStorePushTokens({ parentMerchantIds: [uid] });
    return dedupeByToken([...expo, ...merchant]);
  }

  if ("user_ids" in target && Array.isArray(target.user_ids)) {
    const ids = target.user_ids.map((s) => String(s).trim()).filter(Boolean);
    const expo = await tokensForUserIds(ids);
    const merchant = await tokensFromMerchantStorePushTokens({ parentMerchantIds: ids });
    return dedupeByToken([...expo, ...merchant]);
  }

  if ("role" in target && typeof target.role === "string") {
    if (target.role === "merchant") {
      return merchantRecipients({ allStores: true });
    }
    const ids = await userIdsByRole(target.role, {
      city: "city" in target ? target.city : undefined,
      zone: "zone" in target ? target.zone : undefined,
      status: "status" in target ? target.status : undefined,
    });
    return tokensForUserIds(ids, target.role);
  }

  if ("all_customers" in target && target.all_customers) {
    const ids = await userIdsByRole("customer");
    return tokensForUserIds(ids, "customer");
  }
  if ("all_merchants" in target && target.all_merchants) {
    return merchantRecipients({ allStores: true });
  }
  if ("all_riders" in target && target.all_riders) {
    const ids = await userIdsByRole("rider");
    return tokensForUserIds(ids, "rider");
  }

  if ("store_id" in target && typeof target.store_id === "number") {
    return merchantRecipients({ storeIds: [target.store_id] });
  }

  if ("order_id" in target && typeof target.order_id === "string") {
    const pairs = await userIdsForOrder(target.order_id);
    if (pairs.length === 0) return [];
    const recipientsByRole = await Promise.all(
      (["customer", "merchant", "rider"] as NotificationRole[]).map(async (role) => {
        const ids = pairs.filter((p) => p.role === role).map((p) => p.userId);
        if (role === "merchant") {
          return merchantRecipients({ parentMerchantIds: ids });
        }
        return tokensForUserIds(ids, role);
      }),
    );
    return dedupeByToken(recipientsByRole.flat());
  }

  if ("topic" in target && typeof target.topic === "string") {
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
