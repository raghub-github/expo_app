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
import { isFirebaseAdminConfigured } from "../../config/firebase.js";
import { getSql } from "../../db/client.js";
import type {
  NotificationPlatform,
  NotificationRole,
  Recipient,
  TargetFilter,
} from "./types.js";
import { expandCampaignUserIdCandidates } from "./campaignTarget.js";

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

/**
 * Prefer Android app FCM tokens over Expo tokens for the same user.
 * Expo Push requires FCM credentials uploaded to each Expo project; when that
 * is missing Expo returns InvalidCredentials while direct FCM v1 (same
 * google-services tokens) still works.
 *
 * Only apply when Firebase Admin is configured — otherwise dropping Expo
 * leaves zero deliverable tokens and pushes silently fail.
 */
function preferNativeAndroidFcm(recipients: Recipient[]): Recipient[] {
  if (!isFirebaseAdminConfigured()) return recipients;
  const usersWithAndroidFcm = new Set<string>();
  for (const r of recipients) {
    if (r.platform !== "android") continue;
    if (!r.deviceToken || r.deviceToken === "__in_app_only__") continue;
    if (isExpoPushTokenString(r.deviceToken)) continue;
    usersWithAndroidFcm.add(`${r.role}:${r.userId}`);
  }
  if (usersWithAndroidFcm.size === 0) return recipients;
  return recipients.filter((r) => {
    if (!isExpoPushTokenString(r.deviceToken)) return true;
    return !usersWithAndroidFcm.has(`${r.role}:${r.userId}`);
  });
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

  // App Android FCM is always included; preferNativeAndroidFcm drops Expo
  // duplicates for the same user so we do not double-notify.
  return rows
    .filter((r) => {
      if (!r.native_token || isExpoPushTokenString(r.native_token)) return false;
      return true;
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
  // Always union explicit parents with store→parent (+ store-token user) lookups.
  let parentIds = [...(opts.parentMerchantIds ?? [])];
  if (opts.storeIds?.length) {
    const nested = await Promise.all(opts.storeIds.map((id) => userIdsForStore(id)));
    parentIds = [...new Set([...parentIds, ...nested.flat().filter(Boolean)])];
  }
  const expoRecipients = parentIds.length
    ? await tokensForUserIds(parentIds, "merchant")
    : opts.allStores
      ? await tokensForUserIds(await userIdsByRole("merchant"), "merchant")
      : [];

  // Partnersite web tokens often have store_id=null — always also resolve by parent user ids
  // so store-targeted and all-merchant campaigns reach the browser session.
  // App Android FCM tokens also often have store_id=null — parent id fan-out covers them.
  const nativeParts: Recipient[] = [];
  if (opts.storeIds?.length) {
    nativeParts.push(...(await nativeFcmTokens({ storeIds: opts.storeIds, role: "merchant" })));
  }
  if (parentIds.length) {
    nativeParts.push(...(await nativeFcmTokens({ userIds: parentIds, role: "merchant" })));
  } else if (opts.allStores) {
    nativeParts.push(...(await nativeFcmTokens({ allForRole: true, role: "merchant" })));
  }

  return preferNativeAndroidFcm(dedupeByToken([...storeTokens, ...expoRecipients, ...nativeParts]));
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
  const ids = new Set<string>();
  const rows = (await sql`
    SELECT DISTINCT mp.parent_merchant_id AS user_id
    FROM public.merchant_stores s
    INNER JOIN public.merchant_parents mp ON mp.id = s.parent_id
    WHERE s.id = ${storeId}
      AND s.deleted_at IS NULL
      AND mp.parent_merchant_id IS NOT NULL
  `) as unknown as Array<{ user_id: string }>;
  for (const r of rows) {
    if (r.user_id) ids.add(r.user_id);
  }
  // Devices that registered against this store (partnersite / app) even when
  // parent_id resolution is incomplete — include their user ids for fan-out.
  try {
    const tokenUsers = (await sql`
      SELECT DISTINCT user_id
      FROM public.native_device_push_tokens
      WHERE store_id = ${storeId}
        AND user_id IS NOT NULL
        AND token_type = 'fcm'
        AND (last_seen_at IS NULL OR last_seen_at >= now() - (${TOKEN_STALENESS_DAYS} || ' days')::interval)
    `) as unknown as Array<{ user_id: string }>;
    for (const r of tokenUsers) {
      if (r.user_id) ids.add(r.user_id);
    }
  } catch (e) {
    console.warn("[notifications] store token user lookup skipped:", (e as Error).message);
  }
  return [...ids];
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

/**
 * Sentinel device token for in-app inbox rows when the user has no push token
 * (e.g. Expo Go / permission denied). Push dispatch skips this token.
 */
export const IN_APP_ONLY_TOKEN = "__in_app_only__";

/** Cap census-style inbox fallback so all_* campaigns stay bounded. */
const INBOX_ONLY_BROADCAST_CAP = 2_000;

async function customerIdsForInboxFallback(limit = INBOX_ONLY_BROADCAST_CAP): Promise<string[]> {
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT customer_id AS user_id
      FROM public.customers
      WHERE deleted_at IS NULL
        AND customer_id IS NOT NULL
        AND trim(customer_id) <> ''
      ORDER BY id DESC
      LIMIT ${limit}
    `) as unknown as Array<{ user_id: string }>;
    return rows.map((r) => String(r.user_id).trim()).filter(Boolean);
  } catch (e) {
    console.warn("[notifications] inbox customer census failed:", (e as Error).message);
    return [];
  }
}

async function riderIdsForInboxFallback(limit = INBOX_ONLY_BROADCAST_CAP): Promise<string[]> {
  const sql = getSql();
  try {
    const rows = (await sql`
      SELECT ('usr_' || id::text) AS user_id
      FROM public.riders
      WHERE deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ${limit}
    `) as unknown as Array<{ user_id: string }>;
    return rows.map((r) => String(r.user_id).trim()).filter(Boolean);
  } catch (e) {
    console.warn("[notifications] inbox rider census failed:", (e as Error).message);
    return [];
  }
}

/**
 * Resolve explicit user targets for inbox history even when no push token exists.
 * Used so Expo Go / tokenless devices still get notification_dispatch_logs + inbox.
 * Also covers all_customers / all_riders / role broadcasts (capped census) so
 * super-admin campaigns still land in-app when no Expo tokens are registered yet.
 */
export async function resolveInboxOnlyRecipients(
  target: TargetFilter,
  preferredRole?: NotificationRole | string | null,
): Promise<Recipient[]> {
  const roleHint = normaliseRole(
    preferredRole && preferredRole !== "all" ? preferredRole : "all",
  );

  const toRecipients = (pairs: Array<{ userId: string; role: NotificationRole }>): Recipient[] => {
    const seen = new Set<string>();
    const out: Recipient[] = [];
    for (const p of pairs) {
      const id = p.userId.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        userId: id,
        role: p.role,
        deviceToken: IN_APP_ONLY_TOKEN,
        deviceId: null,
        platform: "android",
      });
    }
    return out;
  };

  if ("user_id" in target && typeof target.user_id === "string") {
    const candidates = expandCampaignUserIdCandidates(target.user_id);
    return toRecipients(
      candidates.map((userId) => ({
        userId,
        role: roleHint === "all" ? "customer" : roleHint,
      })),
    );
  }

  if ("user_ids" in target && Array.isArray(target.user_ids)) {
    const candidates = [
      ...new Set(
        target.user_ids
          .flatMap((s) => expandCampaignUserIdCandidates(String(s)))
          .filter(Boolean),
      ),
    ];
    return toRecipients(
      candidates.map((userId) => ({
        userId,
        role: roleHint === "all" ? "customer" : roleHint,
      })),
    );
  }

  if ("order_id" in target && typeof target.order_id === "string") {
    const pairs = await userIdsForOrder(target.order_id);
    const filtered =
      roleHint === "all"
        ? pairs
        : pairs.filter((p) => p.role === roleHint);
    return toRecipients(filtered.map((p) => ({ userId: p.userId, role: p.role })));
  }

  const wantsCustomers =
    ("all_customers" in target && target.all_customers === true) ||
    ("role" in target && target.role === "customer" && !hasGeoFields(target as never)) ||
    ("topic" in target && String(target.topic).trim() === "app_customer");
  const wantsRiders =
    ("all_riders" in target && target.all_riders === true) ||
    ("role" in target && target.role === "rider" && !hasGeoFields(target as never)) ||
    ("topic" in target && String(target.topic).trim() === "app_rider");

  if (wantsCustomers || wantsRiders) {
    const pairs: Array<{ userId: string; role: NotificationRole }> = [];
    if (wantsCustomers) {
      for (const userId of await customerIdsForInboxFallback()) {
        pairs.push({ userId, role: "customer" });
      }
    }
    if (wantsRiders) {
      for (const userId of await riderIdsForInboxFallback()) {
        pairs.push({ userId, role: "rider" });
      }
    }
    return toRecipients(pairs);
  }

  // Geo customer/rider: resolve audience ids even without tokens.
  if ("geo" in target && target.geo === true && hasGeoFields(target)) {
    const audience = await resolveGeoAudience({
      city: target.city,
      lat: target.lat,
      lng: target.lng,
      radius_km: target.radius_km,
      role: target.role ?? roleHint === "all" ? null : roleHint,
    });
    const pairs: Array<{ userId: string; role: NotificationRole }> = [];
    for (const userId of audience.customerIds) pairs.push({ userId, role: "customer" });
    for (const userId of audience.riderIds) pairs.push({ userId, role: "rider" });
    for (const userId of audience.merchantParentIds) pairs.push({ userId, role: "merchant" });
    return toRecipients(pairs);
  }

  return [];
}

async function recipientsForRole(role: NotificationRole): Promise<Recipient[]> {
  if (role === "merchant") {
    return merchantRecipients({ allStores: true });
  }
  const ids = await userIdsByRole(role);
  const expo = await tokensForUserIds(ids, role);
  const native = await nativeFcmTokens({ allForRole: true, role });
  return preferNativeAndroidFcm(dedupeByToken([...expo, ...native]));
}

const DEFAULT_GEO_RADIUS_KM = 25;

function hasGeoFields(target: {
  city?: string;
  lat?: number;
  lng?: number;
}): boolean {
  const city = typeof target.city === "string" && target.city.trim().length > 0;
  const hasCoords =
    typeof target.lat === "number" &&
    Number.isFinite(target.lat) &&
    typeof target.lng === "number" &&
    Number.isFinite(target.lng);
  return city || hasCoords;
}

/**
 * Resolve user ids (customers / riders / merchant parent + store ids) for a geo filter.
 * City-only, lat/lng-only, or both (city AND radius when coords exist).
 */
async function resolveGeoAudience(opts: {
  city?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
  role?: NotificationRole | null;
}): Promise<{
  customerIds: string[];
  riderIds: string[];
  merchantParentIds: string[];
  storeIds: number[];
}> {
  const sql = getSql();
  const city = opts.city?.trim() ?? "";
  const hasCity = city.length > 0;
  const hasCoords =
    typeof opts.lat === "number" &&
    Number.isFinite(opts.lat) &&
    typeof opts.lng === "number" &&
    Number.isFinite(opts.lng);
  const radiusKm =
    typeof opts.radius_km === "number" && Number.isFinite(opts.radius_km) && opts.radius_km > 0
      ? opts.radius_km
      : DEFAULT_GEO_RADIUS_KM;
  const role = opts.role && opts.role !== "all" ? opts.role : null;

  const customerIds: string[] = [];
  const riderIds: string[] = [];
  const merchantParentIds: string[] = [];
  const storeIds: number[] = [];

  if (!hasCity && !hasCoords) {
    return { customerIds, riderIds, merchantParentIds, storeIds };
  }

  // Haversine in km — identifiers are hardcoded (never from user input).
  // Coordinates are only read behind `hasCoords`, so pin them as numbers here.
  const centerLat = typeof opts.lat === "number" ? opts.lat : 0;
  const centerLng = typeof opts.lng === "number" ? opts.lng : 0;
  const withinRadius = (pair: "ca" | "cal" | "c" | "r" | "ra" | "ms") => {
    const cols =
      pair === "ca"
        ? { lat: sql`ca.latitude`, lng: sql`ca.longitude` }
        : pair === "cal"
          ? { lat: sql`cal.latitude`, lng: sql`cal.longitude` }
          : pair === "c"
            ? { lat: sql`c.latitude`, lng: sql`c.longitude` }
            : pair === "r"
              ? { lat: sql`r.lat`, lng: sql`r.lon` }
              : pair === "ra"
                ? { lat: sql`ra.latitude`, lng: sql`ra.longitude` }
                : { lat: sql`ms.latitude`, lng: sql`ms.longitude` };
    return sql`
      (
        6371 * acos(
          least(
            1.0,
            greatest(
              -1.0,
              cos(radians(${centerLat})) * cos(radians(${cols.lat}))
                * cos(radians(${cols.lng}) - radians(${centerLng}))
                + sin(radians(${centerLat})) * sin(radians(${cols.lat}))
            )
          )
        )
      ) <= ${radiusKm}
    `;
  };

  if (!role || role === "customer") {
    try {
      const rows = (await sql`
        SELECT DISTINCT c.customer_id AS user_id
        FROM public.customers c
        LEFT JOIN public.customer_addresses ca
          ON ca.customer_id = c.id
          AND ca.deleted_at IS NULL
          AND ca.is_active IS DISTINCT FROM false
        LEFT JOIN public.customer_active_location cal ON cal.customer_id = c.id
        WHERE c.deleted_at IS NULL
          AND c.customer_id IS NOT NULL
          AND (
            ${
              hasCity && hasCoords
                ? sql`(
                    lower(coalesce(ca.city, c.city, '')) = lower(${city})
                    AND (
                      (ca.latitude IS NOT NULL AND ca.longitude IS NOT NULL AND ${withinRadius("ca")})
                      OR (cal.latitude IS NOT NULL AND cal.longitude IS NOT NULL AND ${withinRadius("cal")})
                      OR (c.latitude IS NOT NULL AND c.longitude IS NOT NULL AND ${withinRadius("c")})
                      OR (ca.latitude IS NULL AND cal.latitude IS NULL AND c.latitude IS NULL)
                    )
                  )`
                : hasCity
                  ? sql`lower(coalesce(ca.city, c.city, '')) = lower(${city})`
                  : sql`(
                      (ca.latitude IS NOT NULL AND ca.longitude IS NOT NULL AND ${withinRadius("ca")})
                      OR (cal.latitude IS NOT NULL AND cal.longitude IS NOT NULL AND ${withinRadius("cal")})
                      OR (c.latitude IS NOT NULL AND c.longitude IS NOT NULL AND ${withinRadius("c")})
                    )`
            }
          )
      `) as unknown as Array<{ user_id: string }>;
      for (const r of rows) if (r.user_id) customerIds.push(r.user_id);
    } catch (e) {
      console.warn("[notifications] geo customers lookup failed:", (e as Error).message);
    }
  }

  if (!role || role === "rider") {
    try {
      const rows = (await sql`
        SELECT DISTINCT ('usr_' || r.id::text) AS user_id
        FROM public.riders r
        LEFT JOIN public.rider_addresses ra
          ON ra.rider_id = r.id AND ra.is_primary = true
        LEFT JOIN public.cities ci ON ci.id = ra.city_id
        WHERE r.deleted_at IS NULL
          AND (
            ${
              hasCity && hasCoords
                ? sql`(
                    (
                      lower(coalesce(r.city, ci.name, '')) = lower(${city})
                    )
                    AND (
                      (r.lat IS NOT NULL AND r.lon IS NOT NULL AND ${withinRadius("r")})
                      OR (ra.latitude IS NOT NULL AND ra.longitude IS NOT NULL AND ${withinRadius("ra")})
                      OR (r.lat IS NULL AND ra.latitude IS NULL)
                    )
                  )`
                : hasCity
                  ? sql`lower(coalesce(r.city, ci.name, '')) = lower(${city})`
                  : sql`(
                      (r.lat IS NOT NULL AND r.lon IS NOT NULL AND ${withinRadius("r")})
                      OR (ra.latitude IS NOT NULL AND ra.longitude IS NOT NULL AND ${withinRadius("ra")})
                    )`
            }
          )
      `) as unknown as Array<{ user_id: string }>;
      for (const r of rows) if (r.user_id) riderIds.push(r.user_id);
    } catch (e) {
      console.warn("[notifications] geo riders lookup failed:", (e as Error).message);
    }
  }

  if (!role || role === "merchant") {
    try {
      // City match is fuzzy (ILIKE) — stores often store "Panipat Haryana" etc.
      // When both city + coords are provided, match EITHER (not AND) so a store
      // with correct lat/lng still receives even if city text differs.
      const cityLike = hasCity ? `%${city}%` : "";
      const rows = (await sql`
        SELECT ms.id AS store_id, mp.parent_merchant_id AS parent_id
        FROM public.merchant_stores ms
        INNER JOIN public.merchant_parents mp ON mp.id = ms.parent_id
        WHERE ms.deleted_at IS NULL
          AND (
            ${
              hasCity && hasCoords
                ? sql`(
                    lower(coalesce(ms.city, '')) LIKE lower(${cityLike})
                    OR (ms.latitude IS NOT NULL AND ms.longitude IS NOT NULL AND ${withinRadius("ms")})
                  )`
                : hasCity
                  ? sql`lower(coalesce(ms.city, '')) LIKE lower(${cityLike})`
                  : sql`(ms.latitude IS NOT NULL AND ms.longitude IS NOT NULL AND ${withinRadius("ms")})`
            }
          )
      `) as unknown as Array<{ store_id: number | string; parent_id: string | null }>;
      for (const r of rows) {
        const sid = Number(r.store_id);
        if (Number.isFinite(sid) && sid > 0) storeIds.push(sid);
        if (r.parent_id) merchantParentIds.push(r.parent_id);
      }
    } catch (e) {
      console.warn("[notifications] geo merchants lookup failed:", (e as Error).message);
    }
  }

  return {
    customerIds: [...new Set(customerIds)],
    riderIds: [...new Set(riderIds)],
    merchantParentIds: [...new Set(merchantParentIds)],
    storeIds: [...new Set(storeIds)],
  };
}

async function recipientsForGeo(opts: {
  city?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
  role?: NotificationRole | null;
}): Promise<Recipient[]> {
  const audience = await resolveGeoAudience(opts);
  const out: Recipient[] = [];

  if (audience.customerIds.length) {
    const expo = await tokensForUserIds(audience.customerIds, "customer");
    const native = await nativeFcmTokens({ userIds: audience.customerIds, role: "customer" });
    out.push(...expo, ...native);
  }
  if (audience.riderIds.length) {
    const expo = await tokensForUserIds(audience.riderIds, "rider");
    const native = await nativeFcmTokens({ userIds: audience.riderIds, role: "rider" });
    out.push(...expo, ...native);
  }
  if (audience.storeIds.length || audience.merchantParentIds.length) {
    out.push(
      ...(await merchantRecipients({
        storeIds: audience.storeIds.length ? audience.storeIds : undefined,
        parentMerchantIds: audience.merchantParentIds.length
          ? audience.merchantParentIds
          : undefined,
      })),
    );
  }
  return dedupeByToken(out);
}

/**
 * Resolve a target filter into concrete delivery recipients.
 */
export async function resolveTarget(target: TargetFilter): Promise<Recipient[]> {
  const recipients = await resolveTargetRaw(target);
  return preferNativeAndroidFcm(dedupeByToken(recipients));
}

async function resolveTargetRaw(target: TargetFilter): Promise<Recipient[]> {
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
    const candidates = expandCampaignUserIdCandidates(target.user_id);
    const expo = await tokensForUserIds(candidates);
    const merchant = await tokensFromMerchantStorePushTokens({ parentMerchantIds: candidates });
    const native = await nativeFcmTokens({ userIds: candidates });
    return dedupeByToken([...expo, ...merchant, ...native]);
  }

  if ("user_ids" in target && Array.isArray(target.user_ids)) {
    const candidates = [
      ...new Set(
        target.user_ids
          .flatMap((s) => expandCampaignUserIdCandidates(String(s)))
          .filter(Boolean),
      ),
    ];
    const expo = await tokensForUserIds(candidates);
    const merchant = await tokensFromMerchantStorePushTokens({ parentMerchantIds: candidates });
    const native = await nativeFcmTokens({ userIds: candidates });
    return dedupeByToken([...expo, ...merchant, ...native]);
  }

  // Dedicated city / lat-lng target (`geo: true`).
  if ("geo" in target && target.geo === true && hasGeoFields(target)) {
    return recipientsForGeo({
      city: target.city,
      lat: target.lat,
      lng: target.lng,
      radius_km: target.radius_km,
      role: target.role ?? null,
    });
  }

  if ("role" in target && typeof target.role === "string") {
    // Role + optional city / lat-lng overlay (typed fields were previously ignored).
    if (hasGeoFields(target)) {
      return recipientsForGeo({
        city: "city" in target ? target.city : undefined,
        lat: "lat" in target ? target.lat : undefined,
        lng: "lng" in target ? target.lng : undefined,
        radius_km: "radius_km" in target ? target.radius_km : undefined,
        role: target.role,
      });
    }
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

  if ("store_ids" in target && Array.isArray(target.store_ids)) {
    const ids = target.store_ids
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return [];
    return merchantRecipients({ storeIds: ids });
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
    // Role topics: fan out by registered tokens (Expo + native FCM + partnersite web).
    // Avoid FCM topic+Expo dual send — dual-token Android devices were double-notified,
    // and partnersite web missed topic campaigns when topic subscribe had failed.
    const roleTopic =
      topic === "app_customer"
        ? ("customer" as const)
        : topic === "app_rider"
          ? ("rider" as const)
          : topic === "app_merchant"
            ? ("merchant" as const)
            : null;
    if (roleTopic === "merchant") {
      return merchantRecipients({ allStores: true });
    }
    if (roleTopic) {
      return recipientsForRole(roleTopic);
    }

    // Custom topic name — pure FCM topic broadcast (no per-device fan-out).
    return [
      {
        userId: "__topic__",
        role: "all",
        deviceToken: `topic:${topic}`,
        deviceId: null,
        platform: "android",
      },
    ];
  }

  // Broadcast stubs used by older clients / API explorers.
  if ("all_active" in target && target.all_active) {
    return dedupeByToken([
      ...(await recipientsForRole("customer")),
      ...(await merchantRecipients({ allStores: true })),
      ...(await recipientsForRole("rider")),
    ]);
  }
  if ("all_inactive" in target && target.all_inactive) {
    // No reliable inactive inventory — soft-empty rather than erroring the campaign.
    return [];
  }
  if ("subscription_status" in target) {
    return [];
  }
  if ("blacklisted" in target && target.blacklisted) {
    return [];
  }

  return [];
}
