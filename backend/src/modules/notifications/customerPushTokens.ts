/**
 * Pure customer-push token rules. Dispatch and registration call these so
 * device selection does not depend on a live provider.
 */

export type NativeTokenCandidate = {
  user_id: string;
  role: string;
  platform: string | null;
  native_token: string;
  source: string | null;
  device_model?: string | null;
  last_seen_at?: Date | string | null;
};

export function nativeTokenSeenAt(row: { last_seen_at?: Date | string | null }): number {
  const raw = row.last_seen_at;
  if (!raw) return 0;
  const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
}

/**
 * One row per distinct FCM token (newest last_seen wins).
 * A missing or shared device_model must not drop another device's token.
 */
export function dedupeNativeTokensForDispatch<T extends NativeTokenCandidate>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const token = String(row.native_token ?? "").trim();
    if (!token) continue;
    const prev = best.get(token);
    if (!prev || nativeTokenSeenAt(row) >= nativeTokenSeenAt(prev)) best.set(token, row);
  }
  return [...best.values()];
}

/**
 * Customer ids are stored as GM{100000+pk} or, on older rows, the numeric pk.
 * Only expand ids that are already customer-shaped. A bare rider id is not rewritten.
 */
export function expandCustomerPushUserIds(userIds: string[]): string[] {
  const out = new Set<string>();
  for (const raw of userIds) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    out.add(id);
    if (/^GMMP/i.test(id) || /^GMR/i.test(id)) continue;
    const gm = /^GM(\d+)$/i.exec(id);
    if (gm) {
      const n = Number(gm[1]);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (n >= 100000) {
        out.add(String(n - 100000));
        out.add(`GM${n}`);
      } else {
        out.add(String(n));
        out.add(`GM${100000 + n}`);
      }
      continue;
    }
    if (/^\d+$/.test(id)) {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0 && n < 100000) out.add(`GM${100000 + n}`);
    }
  }
  return [...out];
}

/** Previous installation token to delete. Never the token just registered, never a different device. */
export function tokenRetiredOnRegister(
  existingTokens: string[],
  nextToken: string,
  previousToken?: string | null,
): string | null {
  const next = nextToken.trim();
  const prev = String(previousToken ?? "").trim();
  if (!next || !prev || prev === next) return null;
  return existingTokens.some((t) => t.trim() === prev) ? prev : null;
}

/**
 * Drop Android Expo only when that same person already has an Android FCM token.
 * iOS Expo stays — it is a different device and FCM cannot deliver it.
 */
export function shouldKeepPushRecipient(input: {
  platform: string;
  isExpoToken: boolean;
  sameUserHasAndroidFcm: boolean;
  firebaseConfigured: boolean;
}): boolean {
  if (!input.firebaseConfigured) return true;
  if (!input.isExpoToken) return true;
  if (input.platform !== "android") return true;
  return !input.sameUserHasAndroidFcm;
}

/**
 * Token rows sometimes omit role (legacy / partial register). Match the
 * requested audience and treat null/blank as belonging to that audience when
 * we already scoped the lookup to known customer/rider/merchant ids.
 */
export function pushTokenRoleMatches(
  storedRole: string | null | undefined,
  audienceRole: string,
): boolean {
  const want = String(audienceRole ?? "")
    .trim()
    .toLowerCase();
  if (!want || want === "all") return true;
  const got = String(storedRole ?? "")
    .trim()
    .toLowerCase();
  if (!got) return true;
  return got === want;
}

/**
 * Prefer the campaign audience role when the DB role is missing so
 * audience isolation does not drop otherwise-valid tokens as role="all".
 */
export function effectivePushRecipientRole(
  storedRole: string | null | undefined,
  audienceRole?: string | null,
): string {
  const got = String(storedRole ?? "")
    .trim()
    .toLowerCase();
  if (got) return got;
  const want = String(audienceRole ?? "")
    .trim()
    .toLowerCase();
  return want && want !== "all" ? want : "all";
}

/**
 * Collapse GM / numeric customer aliases so inbox merge does not double-count
 * the same person who already received a push on another id form.
 */
export function customerAudienceCoverKey(userId: string): string {
  const raw = String(userId ?? "").trim();
  if (!raw) return "";
  const gm = /^GM(\d+)$/i.exec(raw);
  if (gm && !/^GMMP/i.test(raw)) {
    const n = Number(gm[1]);
    if (Number.isFinite(n) && n > 0) {
      return `pk:${n >= 100000 ? n - 100000 : n}`;
    }
  }
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return `pk:${n}`;
  }
  return `id:${raw.toLowerCase()}`;
}
