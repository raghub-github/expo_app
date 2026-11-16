import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { assertStaffManageAccess } from "@/lib/staff/assert-staff-manage";
import {
  deactivateAllSessionsForMerchant,
  deactivateSessionsForDevice,
} from "@/lib/auth/merchant-session-db";
import { deviceIdCookie } from "@/lib/auth/auth-cookie-names";
import { client as sql } from "@/lib/drizzle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same source of truth as merchant app Staff → devices:
 * `user_device_sessions` keyed by merchant_parents.parent_merchant_id (JWT sub / account id).
 */
async function resolveAccountUserId(parentId: number): Promise<string | null> {
  const rows = await sql`
    SELECT parent_merchant_id
    FROM merchant_parents WHERE id = ${parentId} LIMIT 1
  `;
  const id = (rows[0] as { parent_merchant_id?: string } | undefined)?.parent_merchant_id;
  return id ? String(id).trim() : null;
}

function mapSession(r: Record<string, unknown>, currentDeviceId: string | null) {
  const deviceId = r.device_id != null ? String(r.device_id) : null;
  return {
    id: Number(r.id),
    device_id: deviceId,
    device_name: r.device_name != null ? String(r.device_name) : null,
    device_type: r.device_type != null ? String(r.device_type) : null,
    os: r.os != null ? String(r.os) : null,
    ip_address: r.ip_address != null ? String(r.ip_address) : null,
    login_method: r.login_method != null ? String(r.login_method) : null,
    login_time: r.login_time != null ? String(r.login_time) : "",
    last_active: r.last_active != null ? String(r.last_active) : "",
    is_active: r.is_active !== false,
    app_source: r.app_source != null ? String(r.app_source) : null,
    user_agent: r.user_agent != null ? String(r.user_agent) : null,
    is_current: Boolean(currentDeviceId && deviceId && deviceId === currentDeviceId),
  };
}

/** GET /api/merchant/staff/devices?storeId= */
export async function GET(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStaffManageAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const cookieStore = await cookies();
    const currentDeviceId = cookieStore.get(deviceIdCookie())?.value?.trim() ?? null;
    const accountUserId = await resolveAccountUserId(access.parentId);
    if (!accountUserId) {
      return NextResponse.json({ currentDeviceId, sessions: [] });
    }

    // Keep this browser device visible in the same table the merchant app reads.
    if (currentDeviceId) {
      try {
        const ua = req.headers.get("user-agent")?.slice(0, 255) ?? null;
        const now = new Date().toISOString();
        const existing = await sql`
          SELECT id FROM user_device_sessions
          WHERE user_id = ${accountUserId} AND device_id = ${currentDeviceId}
          LIMIT 1
        `;
        if (existing[0]) {
          await sql`
            UPDATE user_device_sessions
            SET is_active = TRUE,
                last_active = ${now},
                app_source = COALESCE(app_source, 'partnersite'),
                device_type = COALESCE(device_type, 'web'),
                user_agent = COALESCE(${ua}, user_agent)
            WHERE id = ${(existing[0] as { id: number }).id}
          `;
        } else {
          await sql`
            INSERT INTO user_device_sessions (
              user_id, parent_store_id, device_type, device_name, os, login_method,
              device_id, is_active, last_active, login_time, app_source, user_agent
            ) VALUES (
              ${accountUserId},
              ${access.parentId},
              'web',
              'Partner site · Web browser',
              'Web',
              'partnersite',
              ${currentDeviceId},
              TRUE,
              ${now},
              ${now},
              'partnersite',
              ${ua}
            )
          `;
        }
      } catch (e) {
        console.warn("[staff/devices] sync current device skipped", e);
      }
    }

    let rows: Record<string, unknown>[] = [];
    try {
      rows = (await sql`
        SELECT id, user_id, device_id, device_name, device_type, os, ip_address,
               login_method, login_time, last_active, is_active, app_source, user_agent
        FROM user_device_sessions
        WHERE user_id = ${accountUserId}
          AND is_active = TRUE
        ORDER BY last_active DESC NULLS LAST, login_time DESC
        LIMIT 80
      `) as Record<string, unknown>[];
    } catch {
      rows = (await sql`
        SELECT id, user_id, device_id, device_name, device_type, os, ip_address,
               login_method, login_time, last_active, is_active
        FROM user_device_sessions
        WHERE user_id = ${accountUserId}
          AND is_active = TRUE
        ORDER BY last_active DESC NULLS LAST, login_time DESC
        LIMIT 80
      `) as Record<string, unknown>[];
    }

    return NextResponse.json({
      currentDeviceId,
      sessions: rows.map((r) => mapSession(r, currentDeviceId)),
    });
  } catch (e) {
    console.error("[staff/devices GET]", e);
    return NextResponse.json({ error: "Failed to load devices" }, { status: 500 });
  }
}

/**
 * POST /api/merchant/staff/devices?storeId=
 * body: { action: "logout_one" | "logout_all", device_id?: string, session_id?: number, include_current?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const storeId = req.nextUrl.searchParams.get("storeId");
    const access = await assertStaffManageAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      device_id?: string;
      session_id?: number;
      include_current?: boolean;
    };
    const action = String(body.action ?? "").trim();
    const accountUserId = await resolveAccountUserId(access.parentId);
    const cookieStore = await cookies();
    const current = cookieStore.get(deviceIdCookie())?.value?.trim() ?? null;

    if (action === "logout_one") {
      const deviceId = String(body.device_id ?? "").trim();
      const sessionId =
        typeof body.session_id === "number" && Number.isFinite(body.session_id)
          ? body.session_id
          : null;

      if (sessionId != null) {
        try {
          await sql`
            DELETE FROM user_device_sessions
            WHERE id = ${sessionId}
              AND (${accountUserId}::text IS NULL OR user_id = ${accountUserId})
          `;
        } catch {
          await sql`
            UPDATE user_device_sessions
            SET is_active = FALSE
            WHERE id = ${sessionId}
          `;
        }
      }
      if (deviceId) {
        await deactivateSessionsForDevice(deviceId);
        if (accountUserId) {
          try {
            await sql`
              DELETE FROM user_device_sessions
              WHERE user_id = ${accountUserId} AND device_id = ${deviceId}
            `;
          } catch {
            await sql`
              UPDATE user_device_sessions
              SET is_active = FALSE
              WHERE user_id = ${accountUserId} AND device_id = ${deviceId}
            `;
          }
        }
      }
      if (!deviceId && sessionId == null) {
        return NextResponse.json({ error: "device_id or session_id required" }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "logout_all") {
      await deactivateAllSessionsForMerchant(access.parentId);
      if (accountUserId) {
        try {
          if (body.include_current || !current) {
            await sql`DELETE FROM user_device_sessions WHERE user_id = ${accountUserId}`;
          } else {
            await sql`
              DELETE FROM user_device_sessions
              WHERE user_id = ${accountUserId}
                AND (device_id IS NULL OR device_id <> ${current})
            `;
          }
        } catch {
          if (body.include_current || !current) {
            await sql`
              UPDATE user_device_sessions SET is_active = FALSE
              WHERE user_id = ${accountUserId}
            `;
          } else {
            await sql`
              UPDATE user_device_sessions SET is_active = FALSE
              WHERE user_id = ${accountUserId}
                AND (device_id IS NULL OR device_id <> ${current})
            `;
          }
        }
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("[staff/devices POST]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
