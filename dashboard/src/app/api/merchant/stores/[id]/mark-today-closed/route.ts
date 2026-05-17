import { NextRequest, NextResponse } from "next/server";
import { authorizeMerchantStoreRoute } from "@/lib/merchant-store-route-auth";
import { triggerStoreScheduleTick } from "@/lib/triggerStoreScheduleTick";

export const runtime = "nodejs";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function todayDayKeyIst(): (typeof DAY_KEYS)[number] {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
  }).format(new Date());
  const key = weekday.toLowerCase() as (typeof DAY_KEYS)[number];
  return DAY_KEYS.includes(key) ? key : "monday";
}

function normalizeClosedDays(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => String(d).trim().toLowerCase())
    .filter((d) => DAY_KEYS.includes(d as (typeof DAY_KEYS)[number]));
}

/** POST — toggle or set whether today is a scheduled closed day (operating hours closed_days). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authorizeMerchantStoreRoute(id, { requireTiming: true });
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => ({}));
    const today = todayDayKeyIst();
    const wantClosed =
      typeof body.closed === "boolean" ? body.closed : undefined;

    const rows = await auth.sql`
      SELECT closed_days FROM merchant_store_operating_hours
      WHERE store_id = ${auth.storeId}
      LIMIT 1
    `;
    const row = rows[0] as { closed_days: unknown } | undefined;
    const current = normalizeClosedDays(row?.closed_days);
    const hasToday = current.includes(today);
    const nextClosed =
      wantClosed !== undefined ? wantClosed : !hasToday;

    let nextDays: string[];
    if (nextClosed && !hasToday) {
      nextDays = [...current, today];
    } else if (!nextClosed && hasToday) {
      nextDays = current.filter((d) => d !== today);
    } else {
      nextDays = current;
    }

    if (row) {
      await auth.sql`
        UPDATE merchant_store_operating_hours
        SET closed_days = ${JSON.stringify(nextDays)}::jsonb,
            updated_at = NOW()
        WHERE store_id = ${auth.storeId}
      `;
    } else {
      await auth.sql`
        INSERT INTO merchant_store_operating_hours (store_id, closed_days, same_for_all_days, is_24_hours)
        VALUES (${auth.storeId}, ${JSON.stringify(nextDays)}::jsonb, FALSE, FALSE)
      `;
    }

    await triggerStoreScheduleTick(auth.storeId);

    return NextResponse.json({
      success: true,
      today,
      is_today_scheduled_closed: nextDays.includes(today),
      closed_days: nextDays,
    });
  } catch (e) {
    console.error("[POST mark-today-closed]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
