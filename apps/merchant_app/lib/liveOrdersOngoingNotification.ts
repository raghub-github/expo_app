/**
 * Zomato-style Android sticky for merchant kitchen status.
 *
 * Writes into the single STORE_STATUS tray id (not a second notification):
 *   - 0 live orders → "Waiting for orders"
 *   - live orders → Prep / Ready / Out progress lines
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import { isAppForeground } from "@/lib/appForeground";
import {
  getActiveOrdersBreakdown,
  type ActiveOrdersBreakdown,
} from "@/services/storeSettingsApi";
import { updateOnlineStoreStatusKitchenBody } from "@/lib/storeStatusNotification";

export const LIVE_ORDERS_ONGOING_ID = "merchant-live-orders-ongoing";
/** Legacy idle id — dismiss so only one sticky shows. */
export const LEGACY_ONLINE_NOTIF_ID = "merchant-store-online-status";
export const LIVE_ORDERS_CHANNEL_ID = "merchant_live_orders";
export const LIVE_ORDERS_HREF = "/(tabs)/orders?tab=active";

/** Zomato-style ongoing tray while the store is online (waiting for orders / kitchen status). */
const KITCHEN_STICKY_ENABLED = true;

/** When false, sticky must not be shown (store closed / logged out / feature off). */
let kitchenStickyAllowed = false;
let lastStoreMeta: { storeId: number; storeName: string; merchantId?: string | null } | null =
  null;

/**
 * Gate for all kitchen sticky writers (poll, push, order transitions).
 */
export function setKitchenStickyAllowed(allowed: boolean): void {
  if (!KITCHEN_STICKY_ENABLED) {
    kitchenStickyAllowed = false;
    return;
  }
  kitchenStickyAllowed = allowed;
}

export function isKitchenStickyAllowed(): boolean {
  return kitchenStickyAllowed;
}

/** Remember which store the ONLINE sticky belongs to (for push-driven updates). */
export function setKitchenStickyStoreMeta(meta: {
  storeId: number;
  storeName?: string | null;
  merchantId?: string | null;
} | null): void {
  if (!meta || !Number.isInteger(meta.storeId) || meta.storeId < 1) {
    lastStoreMeta = null;
    return;
  }
  lastStoreMeta = {
    storeId: meta.storeId,
    storeName: meta.storeName?.trim() || "Your restaurant",
    merchantId: meta.merchantId ?? null,
  };
}

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

let lastSignature: string | null = null;
let inFlight = false;

async function loadNotifications() {
  return import("expo-notifications");
}

export function formatKitchenStickyBody(
  breakdown: ActiveOrdersBreakdown,
  _opts?: { eventSubtitle?: string | null }
): string {
  // Zomato-style: only non-zero stages show; zero stages auto-hide.
  // 0 live work → "Waiting for orders".
  const parts: string[] = [];
  if (breakdown.preparing > 0) parts.push(`🍳 ${breakdown.preparing} preparing`);
  if (breakdown.ready > 0) parts.push(`✅ ${breakdown.ready} ready`);
  if (breakdown.out_for_delivery > 0) {
    parts.push(`🛵 ${breakdown.out_for_delivery} out for delivery`);
  }
  if (breakdown.pending_accept > 0) {
    parts.push(`🔔 ${breakdown.pending_accept} new`);
  }
  return parts.length > 0 ? parts.join("\n") : "Waiting for orders";
}

export function formatKitchenStickyTitle(storeName: string): string {
  const name = storeName.trim() || "Your restaurant";
  return `🟢 ${name} is online`;
}

export async function dismissLiveOrdersOngoingNotification(): Promise<void> {
  if (Platform.OS !== "android") return;
  lastSignature = null;
  try {
    const Notifications = await loadNotifications();
    await Notifications.dismissNotificationAsync(LIVE_ORDERS_ONGOING_ID);
    await Notifications.dismissNotificationAsync(LEGACY_ONLINE_NOTIF_ID);
  } catch {
    /* best-effort */
  }
}

export type KitchenStickyOpts = {
  storeName: string;
  breakdown: ActiveOrdersBreakdown;
  /** Ignored — kept for call-site compat; sticky stays Prep/Ready/Out only. */
  eventSubtitle?: string | null;
  force?: boolean;
  storeId?: number;
  merchantId?: string | null;
};

export async function showOrUpdateKitchenSticky(
  opts: KitchenStickyOpts
): Promise<void> {
  if (!KITCHEN_STICKY_ENABLED) return;
  if (Platform.OS !== "android") return;
  if (!kitchenStickyAllowed) return;

  const storeId = opts.storeId ?? lastStoreMeta?.storeId;
  if (storeId == null || !Number.isInteger(storeId) || storeId < 1) return;

  const storeName =
    opts.storeName.trim() || lastStoreMeta?.storeName || "Your restaurant";
  const body = formatKitchenStickyBody(opts.breakdown);
  const signature = `${storeId}|${storeName}|${body}|${opts.breakdown.active_orders}`;
  if (!opts.force && signature === lastSignature) return;

  await updateOnlineStoreStatusKitchenBody({
    storeId,
    storeName,
    merchantId: opts.merchantId ?? lastStoreMeta?.merchantId,
    body,
    force: opts.force === true,
  });
  lastSignature = signature;
  lastStoreMeta = {
    storeId,
    storeName,
    merchantId: opts.merchantId ?? lastStoreMeta?.merchantId ?? null,
  };
}

/** @deprecated Prefer showOrUpdateKitchenSticky — kept for call sites that only have a count. */
export async function showOrUpdateLiveOrdersOngoingNotification(
  count: number,
  opts?: { subtitle?: string | null; force?: boolean; storeName?: string }
): Promise<void> {
  await showOrUpdateKitchenSticky({
    storeName: opts?.storeName ?? "Your restaurant",
    breakdown: {
      active_orders: Math.max(0, count),
      pending_accept: 0,
      preparing: Math.max(0, count),
      ready: 0,
      out_for_delivery: 0,
    },
    eventSubtitle: opts?.subtitle,
    force: opts?.force,
  });
}

/**
 * Refresh sticky from API breakdown. Call after transitions / on lifecycle push.
 */
export async function refreshLiveOrdersOngoingNotification(args: {
  storeId: number;
  token: string;
  storeName?: string | null;
  subtitle?: string | null;
  force?: boolean;
  merchantId?: string | null;
}): Promise<void> {
  if (!KITCHEN_STICKY_ENABLED) return;
  if (Platform.OS !== "android") return;
  if (!kitchenStickyAllowed) return;
  if (!args.force && !isAppForeground()) return;
  if (inFlight) return;
  inFlight = true;
  try {
    const breakdown = await getActiveOrdersBreakdown(args.storeId, args.token);
    if (!kitchenStickyAllowed) return;
    await showOrUpdateKitchenSticky({
      storeId: args.storeId,
      storeName: args.storeName?.trim() || "Your restaurant",
      merchantId: args.merchantId,
      breakdown,
      eventSubtitle: args.subtitle,
      force: args.force ?? Boolean(args.subtitle),
    });
  } catch {
    /* keep last shown */
  } finally {
    inFlight = false;
  }
}

/**
 * Apply count / breakdown embedded in a push payload (works in background).
 */
export async function applyLiveOrdersCountFromPush(args: {
  activeOrdersCount: number;
  storeName?: string | null;
  subtitle?: string | null;
  preparing?: number | null;
  ready?: number | null;
  outForDelivery?: number | null;
  pendingAccept?: number | null;
  storeId?: number | null;
  merchantId?: string | null;
}): Promise<void> {
  if (!KITCHEN_STICKY_ENABLED) return;
  if (!kitchenStickyAllowed) return;
  const active = Math.max(0, Math.floor(Number(args.activeOrdersCount) || 0));
  const preparing = Math.max(0, Math.floor(Number(args.preparing ?? 0) || 0));
  const ready = Math.max(0, Math.floor(Number(args.ready ?? 0) || 0));
  const out_for_delivery = Math.max(
    0,
    Math.floor(Number(args.outForDelivery ?? 0) || 0)
  );
  const pending_accept = Math.max(
    0,
    Math.floor(Number(args.pendingAccept ?? 0) || 0)
  );
  const hasStages = preparing + ready + out_for_delivery + pending_accept > 0;
  await showOrUpdateKitchenSticky({
    storeId: args.storeId ?? undefined,
    merchantId: args.merchantId,
    storeName: args.storeName?.trim() || "Your restaurant",
    breakdown: {
      active_orders: active,
      pending_accept,
      preparing: hasStages ? preparing : active,
      ready,
      out_for_delivery,
    },
    eventSubtitle: args.subtitle,
    force: true,
  });
}

export function resetLiveOrdersOngoingCache(): void {
  lastSignature = null;
  kitchenStickyAllowed = false;
  lastStoreMeta = null;
  inFlight = false;
}
