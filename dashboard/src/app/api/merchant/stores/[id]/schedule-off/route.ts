import { NextRequest, NextResponse } from "next/server";
import { authorizeMerchantStoreRoute } from "@/lib/merchant-store-route-auth";
import {
  rebuildScheduledOffHolidaysFromClosures,
  clearStaleScheduledClosureVacationOnAvailability,
} from "@/lib/merchant-schedule-off-server";
import { triggerStoreScheduleTick } from "@/lib/triggerStoreScheduleTick";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeMerchantStoreRoute(id);
    if (auth instanceof NextResponse) return auth;

    const nowIso = new Date().toISOString();
    const rows = await auth.sql`
      SELECT id, reason, starts_at, ends_at, status, marked_from
      FROM merchant_store_scheduled_closures
      WHERE store_id = ${auth.storeId}
        AND status IN ('scheduled', 'active')
        AND ends_at > ${nowIso}::timestamptz
      ORDER BY starts_at ASC
    `;

    const closures = rows.map((r) => {
      const row = r as {
        id: number;
        reason: string | null;
        starts_at: Date | string;
        ends_at: Date | string;
        status: string;
      };
      return {
        id: row.id,
        reason: row.reason,
        starts_at:
          row.starts_at instanceof Date ? row.starts_at.toISOString() : String(row.starts_at),
        ends_at: row.ends_at instanceof Date ? row.ends_at.toISOString() : String(row.ends_at),
        status: row.status,
        marked_from: row.marked_from != null ? String(row.marked_from) : null,
      };
    });

    return NextResponse.json({ success: true, closures });
  } catch (e) {
    console.error("[GET schedule-off]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeMerchantStoreRoute(id);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const startsAtRaw = typeof body.starts_at === "string" ? body.starts_at : undefined;
    const endsAtRaw = typeof body.ends_at === "string" ? body.ends_at : undefined;

    if (!reason) {
      return NextResponse.json({ success: false, error: "reason is required" }, { status: 400 });
    }

    const now = new Date();
    const startsAt = startsAtRaw ? new Date(startsAtRaw) : now;
    const endsAt = endsAtRaw ? new Date(endsAtRaw) : new Date(now.getTime() + 2 * 60 * 60 * 1000);

    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt.getTime() <= startsAt.getTime()
    ) {
      return NextResponse.json(
        { success: false, error: "starts_at/ends_at are invalid" },
        { status: 400 }
      );
    }

    await auth.sql`
      UPDATE merchant_store_scheduled_closures
      SET status = 'cancelled', updated_at = NOW()
      WHERE store_id = ${auth.storeId}
        AND status IN ('scheduled', 'active')
    `;

    const inserted = await auth.sql`
      INSERT INTO merchant_store_scheduled_closures (store_id, reason, starts_at, ends_at, status, marked_from)
      VALUES (
        ${auth.storeId},
        ${reason},
        ${startsAt.toISOString()}::timestamptz,
        ${endsAt.toISOString()}::timestamptz,
        'scheduled',
        'dashboard'
      )
      RETURNING id
    `;
    const closureId = (inserted[0] as { id: number } | undefined)?.id ?? null;

    await rebuildScheduledOffHolidaysFromClosures(auth.sql, auth.storeId);
    await triggerStoreScheduleTick(auth.storeId);

    return NextResponse.json({
      success: true,
      scheduled_closure_id: closureId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason,
    });
  } catch (e) {
    console.error("[POST schedule-off]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeMerchantStoreRoute(id);
    if (auth instanceof NextResponse) return auth;

    const closureIdRaw = new URL(request.url).searchParams.get("closure_id");
    if (closureIdRaw != null && closureIdRaw !== "") {
      const closureId = parseInt(closureIdRaw, 10);
      if (!Number.isFinite(closureId)) {
        return NextResponse.json({ success: false, error: "invalid closure_id" }, { status: 400 });
      }
      const existing = await auth.sql`
        SELECT id FROM merchant_store_scheduled_closures
        WHERE id = ${closureId}
          AND store_id = ${auth.storeId}
          AND status IN ('scheduled', 'active')
        LIMIT 1
      `;
      if (existing.length === 0) {
        return NextResponse.json({ success: false, error: "Closure not found" }, { status: 404 });
      }
      await auth.sql`
        DELETE FROM merchant_store_scheduled_closures
        WHERE id = ${closureId} AND store_id = ${auth.storeId}
      `;
    } else {
      await auth.sql`
        DELETE FROM merchant_store_scheduled_closures
        WHERE store_id = ${auth.storeId}
          AND status IN ('scheduled', 'active')
      `;
      const todayUtc = new Date().toISOString().slice(0, 10);
      await auth.sql`
        DELETE FROM merchant_store_holidays
        WHERE store_id = ${auth.storeId}
          AND holiday_type = 'scheduled_off'
          AND holiday_date >= ${todayUtc}::date
      `;
    }

    await rebuildScheduledOffHolidaysFromClosures(auth.sql, auth.storeId);
    await clearStaleScheduledClosureVacationOnAvailability(auth.sql, auth.storeId);
    await triggerStoreScheduleTick(auth.storeId);

    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE schedule-off]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
