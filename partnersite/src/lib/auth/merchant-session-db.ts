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
      if (existing) {
        void syncPartnersiteIntoUserDeviceSessions(merchantId, deviceId, {
          userAgent,
          ipAddress: meta?.ipAddress?.trim() || null,
          deviceLabel,
          loginMethod: meta?.loginMethod?.trim() || "unknown",
        });
        return { id: existing.id, expiresAt: existing.expires_at };
      }
      console.warn(
        "[merchant-session-db] replaceSessionForDevice: 23505 but active row not yet visible (read lag) — treating as success",
      );
      return { id: "pending", expiresAt };
    }
    console.error("[merchant-session-db] replaceSessionForDevice insert error:", error);
    throw new Error("Failed to create session");
  }

  // Dual-write into user_device_sessions so merchant app Contact details shows partnersite logins
  // (Windows / macOS / Linux) alongside app devices. Best-effort — never fail partner login.
  void syncPartnersiteIntoUserDeviceSessions(merchantId, deviceId, {
    userAgent,
    ipAddress: meta?.ipAddress?.trim() || null,
    deviceLabel,
    loginMethod: meta?.loginMethod?.trim() || "unknown",
  });

  return { id: data.id, expiresAt: data.expires_at };
}

function osFromUserAgent(ua: string | null | undefined): string {
  const s = (ua || "").trim();
  if (/Windows NT/i.test(s)) return "Windows";
  if (/Android/i.test(s)) return "Android";
  if (/iPhone|iPad|iPod/i.test(s)) return "iOS";
  if (/Mac OS X/i.test(s)) return "macOS";
  if (/Linux/i.test(s)) return "Linux";
  return "Web";
}

/**
 * Mirror partnersite browser session into user_device_sessions (merchant app device list).
 * I/O-light: one parent lookup + one upsert by (user_id, device_id). Errors are swallowed.
 */
async function syncPartnersiteIntoUserDeviceSessions(
  merchantNumericId: number,
  deviceId: string,
  meta: {
    userAgent: string | null;
    ipAddress: string | null;
    deviceLabel: string;
    loginMethod: string;
  }
): Promise<void> {
  try {
    const db = getSupabase();
    const { data: parent, error: parentErr } = await db
      .from("merchant_parents")
      .select("parent_merchant_id")
      .eq("id", merchantNumericId)
      .maybeSingle();
    if (parentErr || !parent?.parent_merchant_id) return;

    const userId = String(parent.parent_merchant_id).trim();
    if (!userId) return;

    const now = new Date().toISOString();
    const os = osFromUserAgent(meta.userAgent);
    const payload = {
      user_id: userId,
      parent_store_id: merchantNumericId,
      child_store_id: null as number | null,
      device_type: "web",
      device_name: meta.deviceLabel.slice(0, 120) || `Browser on ${os}`,
      os,
      ip_address: meta.ipAddress,
      location: null as string | null,
      login_method: meta.loginMethod || "partnersite",
      device_id: deviceId,
      is_active: true,
      last_active: now,
      login_time: now,
      app_source: "partnersite",
      user_agent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
    };

    // Try update first (cheaper when row exists); else insert.
    const { data: existing } = await db
      .from("user_device_sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .maybeSingle();

    if (existing?.id) {
      const { error: updErr } = await db
        .from("user_device_sessions")
        .update({
          is_active: true,
          last_active: now,
          device_type: payload.device_type,
          device_name: payload.device_name,
          os: payload.os,
          ip_address: payload.ip_address,
          login_method: payload.login_method,
          app_source: payload.app_source,
          user_agent: payload.user_agent,
          parent_store_id: payload.parent_store_id,
        })
        .eq("id", existing.id);
      if (updErr) {
        console.warn("[merchant-session-db] user_device_sessions update skipped:", updErr.message);
      }
      return;
    }

    const { error: insErr } = await db.from("user_device_sessions").insert(payload);
    if (insErr) {
      // Pre-0650: retry without app_source/user_agent
      const { app_source: _a, user_agent: _u, ...legacy } = payload;
      const { error: legacyErr } = await db.from("user_device_sessions").insert(legacy);
      if (legacyErr) {
        console.warn("[merchant-session-db] user_device_sessions insert skipped:", legacyErr.message);
      }
    }
  } catch (e) {
    console.warn(
      "[merchant-session-db] syncPartnersiteIntoUserDeviceSessions failed:",
      e instanceof Error ? e.message : e
    );
  }
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

/**
 * Logout-all engine: deactivate every partnersite browser session AND remove
 * merchant-app `user_device_sessions` for this parent so phone/tablet JWTs revoke.
 */
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
  }

  // Also kick merchant app + dual-written partnersite rows in user_device_sessions.
  try {
    const { data: parent } = await db
      .from("merchant_parents")
      .select("parent_merchant_id")
      .eq("id", merchantId)
      .maybeSingle();
    const userId = parent?.parent_merchant_id != null ? String(parent.parent_merchant_id).trim() : "";
    if (userId) {
      const { error: udsErr } = await db.from("user_device_sessions").delete().eq("user_id", userId);
      if (udsErr) {
        // Soft-fallback if DELETE RLS blocks: mark inactive.
        const { error: softErr } = await db
          .from("user_device_sessions")
          .update({ is_active: false, last_active: now })
          .eq("user_id", userId)
          .eq("is_active", true);
        if (softErr) {
          console.warn(
            "[merchant-session-db] user_device_sessions logout-all skipped:",
            softErr.message
          );
        }
      }
    }
  } catch (e) {
    console.warn(
      "[merchant-session-db] user_device_sessions logout-all failed:",
      e instanceof Error ? e.message : e
    );
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

/**
 * True when this device was explicitly logged out (remote logout-all, single-device logout, partner logout).
 * Used to block self-heal while Supabase cookies may still be valid.
 */
export async function isMerchantDeviceSessionRevoked(
  merchantId: number,
  deviceId: string
): Promise<boolean> {
  if (!merchantId || !deviceId?.trim()) return false;
  const db = getSupabase();
  const trimmedDeviceId = deviceId.trim();
  const active = await hasActiveSessionForDevice(merchantId, trimmedDeviceId);
  if (active) return false;

  const { data: latest, error } = await db
    .from("merchant_sessions")
    .select("is_active, logged_out_at")
    .eq("merchant_id", merchantId)
    .eq("device_id", trimmedDeviceId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[merchant-session-db] isMerchantDeviceSessionRevoked error (fail-open):", error);
    return false;
  }
  if (!latest) return false;
  return latest.is_active === false && latest.logged_out_at != null;
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
