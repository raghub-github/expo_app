import { NextRequest, NextResponse } from "next/server";
import { assertDashboardStoreStaffAccess } from "@/lib/merchant/assert-store-staff-access";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same source as merchant app + partnersite Staff → devices:
 * `user_device_sessions` keyed by merchant_parents.parent_merchant_id.
 */
async function resolveAccountUserId(parentId: number): Promise<string | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT parent_merchant_id
    FROM merchant_parents WHERE id = ${parentId} LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : rows) as
    | { parent_merchant_id?: string }
    | undefined;
  const id = row?.parent_merchant_id;
  return id ? String(id).trim() : null;
}

function mapSession(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    device_id: r.device_id != null ? String(r.device_id) : null,
    device_name: r.device_name != null ? String(r.device_name) : null,
    device_type: r.device_type != null ? String(r.device_type) : null,
    os: r.os != null ? String(r.os) : null,
    login_time: r.login_time != null ? String(r.login_time) : "",
    last_active: r.last_active != null ? String(r.last_active) : "",
    is_active: r.is_active !== false,
    app_source: r.app_source != null ? String(r.app_source) : null,
    user_agent: r.user_agent != null ? String(r.user_agent) : null,
  };
}

/** GET /api/merchant/stores/[id]/staff/devices */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await assertDashboardStoreStaffAccess(id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const accountUserId = await resolveAccountUserId(access.parentId);
    if (!accountUserId) {
      return NextResponse.json({ sessions: [] });
    }

    const sql = getSql();
    let rows: Record<string, unknown>[] = [];
    try {
      rows = (await sql`
        SELECT id, user_id, device_id, device_name, device_type, os,
               login_method, login_time, last_active, is_active, app_source, user_agent
        FROM user_device_sessions
        WHERE user_id = ${accountUserId}
          AND is_active = TRUE
        ORDER BY last_active DESC NULLS LAST, login_time DESC
        LIMIT 80
      `) as Record<string, unknown>[];
    } catch {
      rows = (await sql`
        SELECT id, user_id, device_id, device_name, device_type, os,
               login_method, login_time, last_active, is_active
        FROM user_device_sessions
        WHERE user_id = ${accountUserId}
          AND is_active = TRUE
        ORDER BY last_active DESC NULLS LAST, login_time DESC
        LIMIT 80
      `) as Record<string, unknown>[];
    }

    return NextResponse.json({
      sessions: rows.map((r) => mapSession(r)),
    });
  } catch (e) {
    console.error("[dashboard staff/devices GET]", e);
    return NextResponse.json({ error: "Failed to load devices" }, { status: 500 });
  }
}

/**
 * POST body: { action: "logout_one" | "logout_all", device_id?: string, session_id?: number }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const access = await assertDashboardStoreStaffAccess(id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      device_id?: string;
      session_id?: number;
    };
    const action = String(body.action ?? "").trim();
    const accountUserId = await resolveAccountUserId(access.parentId);
    if (!accountUserId) {
      return NextResponse.json({ ok: true });
    }

    const sql = getSql();

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
            WHERE id = ${sessionId} AND user_id = ${accountUserId}
          `;
        } catch {
          await sql`
            UPDATE user_device_sessions
            SET is_active = FALSE
            WHERE id = ${sessionId} AND user_id = ${accountUserId}
          `;
        }
      }
      if (deviceId) {
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
      if (!deviceId && sessionId == null) {
        return NextResponse.json({ error: "device_id or session_id required" }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "logout_all") {
      try {
        await sql`DELETE FROM user_device_sessions WHERE user_id = ${accountUserId}`;
      } catch {
        await sql`
          UPDATE user_device_sessions SET is_active = FALSE
          WHERE user_id = ${accountUserId}
        `;
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    console.error("[dashboard staff/devices POST]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
