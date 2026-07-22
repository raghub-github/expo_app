/**
 * Per-user notification preferences resolver.
 *
 * Lookup order (first match wins):
 *   1. Exact template code   (e.g. ORDER_ACCEPTED disabled)
 *   2. Category fallback     (e.g. all "marketing" disabled)
 *   3. Default: enabled
 *
 * Critical exception: notifications with priority="critical" ALWAYS deliver
 * regardless of preferences. Account suspension, emergency, payment-failed,
 * fraud alerts — these are non-negotiable per platform policy.
 */
import { getSql } from "../../db/client.js";
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
} from "./types.js";

type PrefRow = {
  user_id: string;
  type: string;
  push: boolean;
  in_app: boolean;
  browser: boolean;
  email: boolean;
};

/**
 * Bulk-fetch preferences for a set of users. Returns map keyed by user_id+type.
 */
async function fetchPreferences(
  userIds: string[],
  templateCode: string,
  category: NotificationCategory | string,
): Promise<Map<string, PrefRow>> {
  if (userIds.length === 0) return new Map();
  const sql = getSql();
  const rows = (await sql`
    SELECT user_id, type, push, in_app, browser, email
    FROM public.notification_user_prefs
    WHERE user_id = ANY(${userIds}::text[])
      AND type = ANY(ARRAY[${templateCode}::text, ${String(category)}::text])
  `) as unknown as PrefRow[];

  const map = new Map<string, PrefRow>();
  // Exact code wins over category — load category first, then overwrite with code.
  for (const r of rows) {
    if (r.type === category) map.set(`${r.user_id}::${category}`, r);
  }
  for (const r of rows) {
    if (r.type === templateCode) map.set(`${r.user_id}::${templateCode}`, r);
  }
  return map;
}

export type ChannelMask = {
  push: boolean;
  in_app: boolean;
  browser: boolean;
  email: boolean;
};

const DEFAULT_MASK: ChannelMask = { push: true, in_app: true, browser: true, email: false };

/**
 * Resolve per-user channel masks for a given template send. Each user gets
 * a ChannelMask describing which channels are allowed.
 */
export async function resolveChannelMasks(
  userIds: string[],
  templateCode: string,
  category: NotificationCategory | string,
  priority: NotificationPriority,
): Promise<Map<string, ChannelMask>> {
  // Critical priority bypasses preferences entirely.
  if (priority === "critical") {
    const map = new Map<string, ChannelMask>();
    for (const u of userIds) map.set(u, { push: true, in_app: true, browser: true, email: true });
    return map;
  }

  const prefs = await fetchPreferences(userIds, templateCode, category);
  const map = new Map<string, ChannelMask>();
  for (const userId of userIds) {
    // Exact code wins
    const exact = prefs.get(`${userId}::${templateCode}`);
    if (exact) {
      map.set(userId, {
        push: exact.push,
        in_app: exact.in_app,
        browser: exact.browser,
        email: exact.email,
      });
      continue;
    }
    // Category fallback
    const cat = prefs.get(`${userId}::${category}`);
    if (cat) {
      map.set(userId, {
        push: cat.push,
        in_app: cat.in_app,
        browser: cat.browser,
        email: cat.email,
      });
      continue;
    }
    // Default
    map.set(userId, { ...DEFAULT_MASK });
  }
  return map;
}

/**
 * Filter a channel set down to those actually permitted by the user's mask.
 */
export function allowedChannelsFor(
  templateChannel: NotificationChannel,
  mask: ChannelMask,
): NotificationChannel[] {
  const allOptions: NotificationChannel[] =
    templateChannel === "all" ? ["push", "in_app", "browser"] : [templateChannel];
  return allOptions.filter((ch) => {
    if (ch === "push") return mask.push;
    if (ch === "in_app") return mask.in_app;
    if (ch === "browser") return mask.browser;
    if (ch === "socket") return true; // admin in-app — always allowed
    return false;
  });
}
