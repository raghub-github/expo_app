import { NextRequest, NextResponse } from "next/server";
import { authorizeMerchantStoreRoute } from "@/lib/merchant-store-route-auth";
import { triggerStoreScheduleTick } from "@/lib/triggerStoreScheduleTick";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeMerchantStoreRoute(id);
    if (auth instanceof NextResponse) return auth;

    const now = new Date();
    const rushRows = await auth.sql`
      SELECT id, duration_minutes, started_at, ends_at, is_active, marked_from
      FROM merchant_store_rush_windows
      WHERE store_id = ${auth.storeId}
        AND is_active = TRUE
        AND ends_at > NOW()
      ORDER BY started_at DESC
      LIMIT 1
    `;
    const row = rushRows[0] as
      | {
          id: number;
          duration_minutes: number;
          started_at: Date | string;
          ends_at: Date | string;
          is_active: boolean;
        }
      | undefined;

    if (!row) {
      return NextResponse.json({
        success: true,
        store_id: auth.storeId,
        is_active: false,
        duration_minutes: null,
        started_at: null,
        ends_at: null,
        remaining_minutes: 0,
      });
    }

    const endsAtMs = new Date(String(row.ends_at)).getTime();
    const remainingMinutes = Math.max(0, Math.floor((endsAtMs - now.getTime()) / 60000));

    return NextResponse.json({
      success: true,
      store_id: auth.storeId,
      is_active: true,
      duration_minutes: Number(row.duration_minutes),
      started_at: new Date(String(row.started_at)).toISOString(),
      ends_at: new Date(String(row.ends_at)).toISOString(),
      remaining_minutes: remainingMinutes,
      marked_from: row.marked_from != null ? String(row.marked_from) : null,
    });
  } catch (e) {
    console.error("[GET rush]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeMerchantStoreRoute(id);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const durationRaw = body.duration_minutes;
    const duration = typeof durationRaw === "number" ? Math.floor(durationRaw) : NaN;
    if (!Number.isInteger(duration) || duration <= 0 || duration > 240) {
      return NextResponse.json(
        { success: false, error: "duration_minutes must be between 1 and 240" },
        { status: 400 }
      );
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + duration * 60000);

    const existingActive = await auth.sql`
      SELECT id FROM merchant_store_rush_windows
      WHERE store_id = ${auth.storeId} AND is_active = TRUE
      ORDER BY started_at DESC
      LIMIT 1
    `;
    const oldRow = existingActive[0] as { id: number } | undefined;
    if (oldRow) {
      await auth.sql`
        UPDATE merchant_store_rush_windows SET is_active = FALSE WHERE id = ${oldRow.id}
      `;
    }

    await auth.sql`
      INSERT INTO merchant_store_rush_windows (store_id, duration_minutes, started_at, ends_at, is_active, created_by, marked_from)
      VALUES (
        ${auth.storeId},
        ${duration},
        ${now.toISOString()}::timestamptz,
        ${endsAt.toISOString()}::timestamptz,
        TRUE,
        NULL,
        'dashboard'
      )
    `;

    await triggerStoreScheduleTick(auth.storeId);

    const remainingMinutes = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 60000));

    return NextResponse.json({
      success: true,
      ok: true,
      store_id: auth.storeId,
      is_active: true,
      duration_minutes: duration,
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      remaining_minutes: remainingMinutes,
    });
  } catch (e) {
    console.error("[POST rush]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeMerchantStoreRoute(id);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    if (body.is_active !== false) {
      return NextResponse.json(
        { success: false, error: "Only is_active=false is supported" },
        { status: 400 }
      );
    }

    const existingRows = await auth.sql`
      SELECT id FROM merchant_store_rush_windows
      WHERE store_id = ${auth.storeId} AND is_active = TRUE
      ORDER BY started_at DESC
      LIMIT 1
    `;
    const row = existingRows[0] as { id: number } | undefined;

    if (row) {
      const now = new Date();
      await auth.sql`
        UPDATE merchant_store_rush_windows
        SET is_active = FALSE, ends_at = ${now.toISOString()}::timestamptz
        WHERE id = ${row.id}
      `;
    }

    await triggerStoreScheduleTick(auth.storeId);

    return NextResponse.json({
      success: true,
      ok: true,
      store_id: auth.storeId,
      is_active: false,
      duration_minutes: null,
      started_at: null,
      ends_at: null,
      remaining_minutes: 0,
    });
  } catch (e) {
    console.error("[PATCH rush]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
