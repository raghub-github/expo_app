/**
 * Resolve a TargetFilter into concrete recipient (user_id, role, device_token, platform) tuples.
 *
 * Token sources:
 *   • expo_push_tokens — Customer / Rider / Merchant Expo delivery (primary mobile path)
 *   • merchant_store_push_tokens — Merchant app per-store Expo tokens
 *   • native_device_push_tokens — Android FCM / web FCM / APNs inventory
 *       - web + partnersite/dashboard browser tokens always included for campaigns
 *       - app FCM tokens included when the user has no Expo token (avoid double-notify)
 */
import { isExpoPushTokenString } from "@gatimitra/contracts";
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
  if (
    lower === "customer" ||
    lower === "merchant" ||
    lower === "rider" ||
    lower === "admin" ||
    lower === "manager" ||
    lower === "support"
  ) {
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

async function tokensForUserIds(
  userIds: string[],
  role?: NotificationRole
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

/**
 * Native FCM (Android/web) tokens. APNs skipped for direct FCM send.
 * `includeAppFcmWithoutExpo` — add app Android FCM only when that user has no Expo token.
 */
async function nativeFcmTokens(opts: {
  userIds?: string[];
  role?: NotificationRole;
  storeIds?: number[];
  allForRole?: boolean;
  includeAppFcmWithoutExpo?: boolean;
}): Promise<Recipient[]> {
  const sql = getSql();
  const userIds = opts.userIds?.map((s) => s.trim()).filter(Boolean) ?? [];
  const storeIds = opts.storeIds?.filter((id) => Number.isFinite(id) && id > 0) ?? [];
  const role = opts.role && opts.role !== "all" ? opts.role : null;

  let rows: Array<{
    user_id: string;
    role: string;
    platform: string | null;
    native_token: string;
    source: string | null;
  }> = [];

  try {
    if (storeIds.length > 0) {
      rows = (await sql`
        SELECT user_id, role, platform, native_token, source
        FROM public.native_device_push_tokens
        WHERE token_type = 'fcm'
          AND store_id = ANY(${storeIds}::bigint[])
          AND (last_seen_at IS NULL OR last_seen_at >= now() - (${TOKEN_STALENESS_DAYS} || ' days')::interval)
      `) as unknown as typeof rows;
    } else if (userIds.length > 0) {
      rows = (await sql`
        SELECT user_id, role, platform, native_token, source
        FROM public.native_device_push_tokens
        WHERE token_type = 'fcm'
          AND user_id = ANY(${userIds}::text[])
          AND (last_seen_at IS NULL OR last_seen_at >= now() - (${TOKEN_STALENESS_DAYS} || ' days')::interval)
          ${role ? sql`AND lower(role) = ${role}` : sql``}
      `) as unknown as typeof rows;
    } else if (opts.allForRole && role) {
      rows = (await sql`
        SELECT user_id, role, platform, native_token, source
        FROM public.native_device_push_tokens
        WHERE token_type = 'fcm'
          AND lower(role) = ${role}
          AND (last_seen_at IS NULL OR last_seen_at >= now() - (${TOKEN_STALENESS_DAYS} || ' days')::interval)
      `) as unknown as typeof rows;
    }
  } catch (e) {
    // Table may not exist yet if migration 0436 not applied — don't fail campaigns.
    console.warn("[notifications] native_device_push_tokens lookup skipped:", (e as Error).message);
    return [];
  }

  const expoUserIds = new Set<string>();
  if (opts.includeAppFcmWithoutExpo !== false) {
    const candidateUsers = [...new Set(rows.map((r) => r.user_id))];
    if (candidateUsers.length > 0) {
      const expoRows = (await sql`
        SELECT DISTINCT user_id FROM public.expo_push_tokens
        WHERE user_id = ANY(${candidateUsers}::text[])
          AND expo_push_token IS NOT NULL
          ${role ? sql`AND lower(role) = ${role}` : sql``}
      `) as unknown as Array<{ user_id: string }>;
      for (const r of expoRows) expoUserIds.add(r.user_id);
    }
  }

  return rows
    .filter((r) => {
      if (!r.native_token || isExpoPushTokenString(r.native_token)) return false;
      const platform = normalisePlatform(r.platform);
      const source = (r.source ?? "app").toLowerCase();
      // Always deliver web / partnersite / dashboard browser tokens.
      if (platform === "web" || source === "partnersite" || source === "dashboard" || source === "browser") {
        return true;
      }
      // App Android FCM: only if no Expo token (prevents double push).
      if (opts.includeAppFcmWithoutExpo === false) return true;
      return !expoUserIds.has(r.user_id);
    })
    .map((r) => ({
      userId: r.user_id,
      role: normaliseRole(r.role),
      deviceToken: r.native_token,
      deviceId: null,
      platform: normalisePlatform(r.platform),
    }));
}

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

  const native = opts.storeIds?.length
    ? await nativeFcmTokens({ storeIds: opts.storeIds, role: "merchant" })
    : parentIds.length
      ? await nativeFcmTokens({ userIds: parentIds, role: "merchant" })
      : opts.allStores
        ? await nativeFcmTokens({ allForRole: true, role: "merchant" })
        : [];

  return dedupeByToken([...storeTokens, ...expoRecipients, ...native]);
}

async function userIdsByRole(role: NotificationRole): Promise<string[]> {
  const sql = getSql();
  if (
    role !== "rider" &&
    role !== "merchant" &&
    role !== "customer" &&
    role !== "admin" &&
    role !== "manager" &&
    role !== "support"
  ) {
    return [];
  }

  const ids = new Set<string>();
  try {
    const expoRows = (await sql`
      SELECT DISTINCT user_id FROM public.expo_push_tokens
      WHERE user_id IS NOT NULL
        AND lower(role) = ${role}
        AND (updated_at IS NULL OR updated_at >= now() - (${TOKEN_STALENESS_DAYS} || ' days')::interval)
    `) as unknown as Array<{ user_id: string }>;
    for (const r of expoRows) ids.add(r.user_id);
  } catch (e) {
    console.warn("[notifications] expo userIdsByRole failed:", (e as Error).message);
  }

  try {
    const nativeRows = (await sql`
      SELECT DISTINCT user_id FROM public.native_device_push_tokens
      WHERE user_id IS NOT NULL
        AND lower(role) = ${role}
        AND token_type = 'fcm'
        AND (last_seen_at IS NULL OR last_seen_at >= now() - (${TOKEN_STALENESS_DAYS} || ' days')::interval)
    `) as unknown as Array<{ user_id: string }>;
    for (const r of nativeRows) ids.add(r.user_id);
  } catch (e) {
    console.warn("[notifications] native userIdsByRole skipped:", (e as Error).message);
  }

  return [...ids];
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

async function userIdsForOrder(
  orderId: string
): Promise<Array<{ userId: string; role: NotificationRole; storeId?: number }>> {
  const sql = getSql();
  const key = orderId.trim();
  if (!key) return [];

  const numericId = /^\d+$/.test(key) ? Number(key) : null;

  const rows = (await sql`
    SELECT
      c.customer_id AS customer_user_id,
      mp.parent_merchant_id AS merchant_user_id,
      CASE
        WHEN ofood.rider_id IS NOT NULL THEN 'usr_' || ofood.rider_id::text
        ELSE NULL
      END AS rider_user_id,
      ofood.merchant_store_id AS store_id
    FROM public.orders_food ofood
    LEFT JOIN public.customers c ON c.id = ofood.customer_id
    LEFT JOIN public.merchant_parents mp ON mp.id = ofood.merchant_parent_id
    WHERE ofood.core_order_id = ${key}
       OR ofood.formatted_order_id = ${key}
       OR ofood.order_id::text = ${key}
       ${numericId != null ? sql`OR ofood.order_id = ${numericId}` : sql``}
    LIMIT 1
  `) as unknown as Array<{
    customer_user_id: string | null;
    merchant_user_id: string | null;
    rider_user_id: string | null;
    store_id: number | null;
  }>;

  const out: Array<{ userId: string; role: NotificationRole; storeId?: number }> = [];
  for (const r of rows) {
    if (r.customer_user_id) out.push({ userId: r.customer_user_id, role: "customer" });
    if (r.merchant_user_id) {
      out.push({
        userId: r.merchant_user_id,
        role: "merchant",
        storeId: r.store_id ?? undefined,
      });
    }
    if (r.rider_user_id) out.push({ userId: r.rider_user_id, role: "rider" });
  }
  return out;
}

async function recipientsForRole(role: NotificationRole): Promise<Recipient[]> {
  if (role === "merchant") {
    return merchantRecipients({ allStores: true });
  }
  const ids = await userIdsByRole(role);
  const expo = await tokensForUserIds(ids, role);
  const native = await nativeFcmTokens({ allForRole: true, role });
  return dedupeByToken([...expo, ...native]);
}

/**
 * Resolve a target filter into concrete delivery recipients.
 */
export async function resolveTarget(target: TargetFilter): Promise<Recipient[]> {
  if ("device_token" in target && target.device_token) {
    return [
      {
        userId: "__direct__",
        role: "all",
        deviceToken: target.device_token,
        deviceId: null,
        platform: "android",
      },
    ];
  }

  if ("device_tokens" in target && Array.isArray(target.device_tokens)) {
    return target.device_tokens
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .map((token) => ({
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
    const native = await nativeFcmTokens({ userIds: [uid] });
    return dedupeByToken([...expo, ...merchant, ...native]);
  }

  if ("user_ids" in target && Array.isArray(target.user_ids)) {
    const ids = target.user_ids.map((s) => String(s).trim()).filter(Boolean);
    const expo = await tokensForUserIds(ids);
    const merchant = await tokensFromMerchantStorePushTokens({ parentMerchantIds: ids });
    const native = await nativeFcmTokens({ userIds: ids });
    return dedupeByToken([...expo, ...merchant, ...native]);
  }

  if ("role" in target && typeof target.role === "string") {
    return recipientsForRole(target.role);
  }

  if ("all_customers" in target && target.all_customers) {
    return recipientsForRole("customer");
  }
  if ("all_merchants" in target && target.all_merchants) {
    return merchantRecipients({ allStores: true });
  }
  if ("all_riders" in target && target.all_riders) {
    return recipientsForRole("rider");
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
          const storeIds = pairs
            .filter((p) => p.role === "merchant" && p.storeId)
            .map((p) => p.storeId!) as number[];
          return merchantRecipients({
            parentMerchantIds: ids,
            storeIds: storeIds.length ? storeIds : undefined,
          });
        }
        const expo = await tokensForUserIds(ids, role);
        const native = await nativeFcmTokens({ userIds: ids, role });
        return dedupeByToken([...expo, ...native]);
      })
    );
    return dedupeByToken(recipientsByRole.flat());
  }

  if ("topic" in target && typeof target.topic === "string") {
    const topic = target.topic.trim();
    const out: Recipient[] = [
      {
        userId: "__topic__",
        role: "all",
        deviceToken: `topic:${topic}`,
        deviceId: null,
        platform: "android",
      },
    ];

    // Role topics (`app_customer` / `app_rider` / `app_merchant`) only reach
    // native FCM subscribers. Also fan out Expo (+ merchant store) tokens so
    // Expo-only devices still receive the campaign.
    const roleTopic =
      topic === "app_customer"
        ? ("customer" as const)
        : topic === "app_rider"
          ? ("rider" as const)
          : topic === "app_merchant"
            ? ("merchant" as const)
            : null;
    if (roleTopic === "merchant") {
      const expoAndStore = await merchantRecipients({ allStores: true });
      // Topic already covers native FCM — keep Expo/store tokens only.
      out.push(...expoAndStore.filter((r) => isExpoPushTokenString(r.deviceToken)));
    } else if (roleTopic) {
      const ids = await userIdsByRole(roleTopic);
      out.push(...(await tokensForUserIds(ids, roleTopic)));
    }

    return dedupeByToken(out);
  }

  return [];
}
