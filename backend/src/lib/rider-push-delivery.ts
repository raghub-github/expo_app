/**
 * Pick which of a rider's push tokens actually get a dispatch offer.
 *
 * Why this exists
 * ---------------
 * `native_device_push_tokens` is keyed on the token itself, and FCM rotates a
 * device's token periodically (app update, Play Services refresh, restore).
 * The old row is only retired when the client remembers to send
 * `previous_native_push_token`, which it frequently does not — so rows pile up.
 * Production showed one rider (RMX3785, a single handset) carrying FOUR live
 * FCM tokens, each minted as the previous one went quiet.
 *
 * The dispatch sender then looped over every token, so one order produced one
 * push PER STALE TOKEN: duplicate "New order received" cards in the tray, and
 * duplicate overlapping alert sounds. Confirmed against
 * notification_dispatch_logs: two deliveries, same alertSessionId, same rider,
 * same second, two different tokens.
 *
 * Collapsing by device is also correct by policy, not just convenient: a rider
 * is single-device by design (see the Mark-Logout takeover flow), so a second
 * live token for the same handset is always staleness, never a second seat.
 */
import { isExpoPushTokenString } from "@gatimitra/contracts";

export type RiderPushTokenRow = {
  token: string;
  deviceModel?: string | null;
  deviceBrand?: string | null;
  osName?: string | null;
  appVersion?: string | null;
  /** epoch ms; higher wins within a device group */
  lastSeenMs?: number | null;
};

/**
 * Identity for "the same handset". The table has no device_id column, so this
 * is the best available proxy. Rows with no metadata at all keep their own
 * token as the key — we never merge devices we cannot actually tell apart.
 */
export function riderDeviceKey(row: RiderPushTokenRow): string {
  const parts = [row.deviceModel, row.deviceBrand, row.osName, row.appVersion]
    .map((p) => String(p ?? "").trim().toLowerCase())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return `token:${row.token}`;
  return `dev:${parts.join("|")}`;
}

/**
 * One native token per device, freshest first; Expo only when there is no
 * native token at all (a native-capable build must never be pushed twice).
 */
export function selectRiderPushDelivery(args: {
  nativeCandidates: RiderPushTokenRow[];
  expoCandidates: string[];
  skipExpo?: boolean;
  skipNative?: boolean;
}): { nativeTokens: string[]; expoTokens: string[] } {
  const freshestByDevice = new Map<string, RiderPushTokenRow>();

  if (!args.skipNative) {
    for (const row of args.nativeCandidates) {
      const token = String(row?.token ?? "").trim();
      if (!token || isExpoPushTokenString(token)) continue;
      const key = riderDeviceKey({ ...row, token });
      const current = freshestByDevice.get(key);
      if (!current) {
        freshestByDevice.set(key, { ...row, token });
        continue;
      }
      // A row that has never been seen loses to one that has; otherwise newest wins.
      const a = Number(current.lastSeenMs ?? 0);
      const b = Number(row.lastSeenMs ?? 0);
      if (b > a) freshestByDevice.set(key, { ...row, token });
    }
  }

  const nativeTokens = [...new Set([...freshestByDevice.values()].map((r) => r.token))];

  // Mirrors the merchant rule: a device reachable natively must not also be
  // reached through Expo, or it rings twice.
  const skipExpo = args.skipExpo === true || nativeTokens.length > 0;
  const expoTokens = skipExpo
    ? []
    : [
        ...new Set(
          args.expoCandidates
            .map((t) => String(t ?? "").trim())
            .filter((t) => t.length > 0 && isExpoPushTokenString(t))
        ),
      ];

  return { nativeTokens, expoTokens };
}
