/**
 * Merchant session table: one active session per device (enforced by DB unique index).
 * - Same device_id always comes from client (localStorage) or cookie so it is stable.
 * - On login: replace session for this device (deactivate existing, insert one).
 * - On logout (this device only): deactivate this device's session; do not invalidate others.
 * - Tracks device metadata so partners can see how many places they are logged in.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30 days — align with partner_* cookie policy

export type MerchantSessionLoginMethod =
  | "google"
  | "phone_otp"
  | "email"
  | "app_handoff"
  | "self_heal"
  | "unknown";

export type MerchantSessionDeviceMeta = {
  userAgent?: string | null;
  ipAddress?: string | null;
  deviceLabel?: string | null;
  loginMethod?: MerchantSessionLoginMethod | string | null;
};

export type MerchantActiveSessionRow = {
  id: string;
  device_id: string;
  created_at: string;
  last_seen_at: string | null;
  expires_at: string;
  user_agent: string | null;
  ip_address: string | null;
  device_label: string | null;
  login_method: string | null;
  is_current: boolean;
};

/** Best-effort short label from User-Agent. */
export function deviceLabelFromUserAgent(ua: string | null | undefined): string {
  const s = (ua || "").trim();
  if (!s) return "Unknown device";
  const browser =
    /Edg\//i.test(s) ? "Edge"
    : /Chrome\//i.test(s) && !/Chromium/i.test(s) ? "Chrome"
    : /Firefox\//i.test(s) ? "Firefox"
    : /Safari\//i.test(s) && !/Chrome/i.test(s) ? "Safari"
    : /OPR\//i.test(s) || /Opera/i.test(s) ? "Opera"
    : "Browser";
  const os =
    /Windows NT/i.test(s) ? "Windows"
    : /Android/i.test(s) ? "Android"
    : /iPhone|iPad|iPod/i.test(s) ? "iOS"
    : /Mac OS X/i.test(s) ? "macOS"
    : /Linux/i.test(s) ? "Linux"
    : "Device";
  return `${browser} on ${os}`;
}

export function clientIpFromRequest(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return null;
}

/** Deactivate all active sessions for this device_id. */
export async function deactivateSessionsForDevice(deviceId: string): Promise<void> {
  const db = getSupabase();
  const now = new Date().toISOString();
  const { error } = await db
    .from("merchant_sessions")
    .update({
      is_active: false,
      logged_out_at: now,
      updated_at: now,
    })
    .eq("device_id", deviceId)
    .eq("is_active", true);
  if (error) {
    console.error("[merchant-session-db] deactivateSessionsForDevice error:", error);
  }
}

/**
 * Replace session for this device: deactivate any existing, then insert one.
 * Uses unique index (device_id WHERE is_active = true) so only one active per device.
 * If two requests race, one insert may get unique violation — we treat as success (other request won).
 */
export async function replaceSessionForDevice(
  deviceId: string,
  merchantId: number,
  meta?: MerchantSessionDeviceMeta
): Promise<{ id: string; expiresAt: string }> {
  const db = getSupabase();
  await deactivateSessionsForDevice(deviceId);

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000).toISOString();
  const userAgent = meta?.userAgent?.trim() || null;
  const deviceLabel =
    meta?.deviceLabel?.trim() ||
    (userAgent ? deviceLabelFromUserAgent(userAgent) : "Unknown device");

  const { data, error } = await db
    .from("merchant_sessions")
    .insert({
      merchant_id: merchantId,
      device_id: deviceId,
      refresh_token_hash: null,
      expires_at: expiresAt,
      is_active: true,
      created_at: now,
      updated_at: now,
      last_seen_at: now,
      logged_out_at: null,
      user_agent: userAgent,
      ip_address: meta?.ipAddress?.trim() || null,
      device_label: deviceLabel,
      login_method: meta?.loginMethod?.trim() || "unknown",
    })
    .select("id, expires_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      // unique_violation: a concurrent request already inserted the active row for this device.
      const { data: existing } = await db
        .from("merchant_sessions")
        .select("id, expires_at")
        .eq("device_id", deviceId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (existing) return { id: existing.id, expiresAt: existing.expires_at };
      console.warn(
        "[merchant-session-db] replaceSessionForDevice: 23505 but active row not yet visible (read lag) — treating as success",
      );
      return { id: "pending", expiresAt };
    }
    console.error("[merchant-session-db] replaceSessionForDevice insert error:", error);
    throw new Error("Failed to create session");
  }
  return { id: data.id, expiresAt: data.expires_at };
}

/** Legacy: create after deactivate (call replaceSessionForDevice instead). */
export async function createMerchantSession(params: {
  merchantId: number;
  deviceId: string;
  refreshTokenHash?: string | null;
  meta?: MerchantSessionDeviceMeta;
}): Promise<{ id: string; expiresAt: string }> {
  return replaceSessionForDevice(params.deviceId, params.merchantId, params.meta);
}

/** Deactivate only this device (logout this device; other devices stay logged in). */
export async function deactivateSessionForDevice(deviceId: string): Promise<void> {
  return deactivateSessionsForDevice(deviceId);
}

/** Deactivate every active device session for this merchant (logout all devices). */
export async function deactivateAllSessionsForMerchant(merchantId: number): Promise<number> {
  if (!merchantId || merchantId < 1) return 0;
  const db = getSupabase();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("merchant_sessions")
    .update({
      is_active: false,
      logged_out_at: now,
      updated_at: now,
    })
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .select("id");
  if (error) {
    console.error("[merchant-session-db] deactivateAllSessionsForMerchant error:", error);
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}

export async function hasActiveSessionForDevice(
  merchantId: number,
  deviceId: string
): Promise<boolean> {
  if (!merchantId || !deviceId?.trim()) return false;
  const db = getSupabase();
  const { data, error } = await db
    .from("merchant_sessions")
    .select("id")
    .eq("merchant_id", merchantId)
    .eq("device_id", deviceId.trim())
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (error) {
    // Fail-open: do not block partner UX on transient DB/network issues.
    console.error("[merchant-session-db] hasActiveSessionForDevice error (fail-open):", error);
    return true;
  }
  return !!data?.id;
}

/** Heartbeat so device list shows recent activity without writing on every page. */
export async function touchSessionLastSeen(deviceId: string, merchantId: number): Promise<void> {
  if (!deviceId?.trim() || !merchantId) return;
  const db = getSupabase();
  const now = new Date().toISOString();
  const { error } = await db
    .from("merchant_sessions")
    .update({ last_seen_at: now, updated_at: now })
    .eq("device_id", deviceId.trim())
    .eq("merchant_id", merchantId)
    .eq("is_active", true);
  if (error) {
    console.warn("[merchant-session-db] touchSessionLastSeen:", error.message);
  }
}

/** Count active (non-expired) device sessions for a merchant parent. */
export async function countActiveSessionsForMerchant(merchantId: number): Promise<number> {
  if (!merchantId || merchantId < 1) return 0;
  const db = getSupabase();
  const { count, error } = await db
    .from("merchant_sessions")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString());
  if (error) {
    console.error("[merchant-session-db] countActiveSessionsForMerchant:", error);
    return 0;
  }
  return count ?? 0;
}

/** List active device sessions for partner UI / logout-all confirmation. */
export async function listActiveSessionsForMerchant(
  merchantId: number,
  currentDeviceId?: string | null
): Promise<MerchantActiveSessionRow[]> {
  if (!merchantId || merchantId < 1) return [];
  const db = getSupabase();
  const { data, error } = await db
    .from("merchant_sessions")
    .select(
      "id, device_id, created_at, last_seen_at, expires_at, user_agent, ip_address, device_label, login_method"
    )
    .eq("merchant_id", merchantId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .order("last_seen_at", { ascending: false });
  if (error) {
    console.error("[merchant-session-db] listActiveSessionsForMerchant:", error);
    return [];
  }
  const current = (currentDeviceId || "").trim();
  return (data ?? []).map((row) => ({
    id: String(row.id),
    device_id: String(row.device_id),
    created_at: String(row.created_at),
    last_seen_at: row.last_seen_at != null ? String(row.last_seen_at) : null,
    expires_at: String(row.expires_at),
    user_agent: row.user_agent != null ? String(row.user_agent) : null,
    ip_address: row.ip_address != null ? String(row.ip_address) : null,
    device_label: row.device_label != null ? String(row.device_label) : null,
    login_method: row.login_method != null ? String(row.login_method) : null,
    is_current: current.length > 0 && String(row.device_id) === current,
  }));
}

/** Server-side fallback only; client should send device_id in body. */
export function generateDeviceId(): string {
  return `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}
