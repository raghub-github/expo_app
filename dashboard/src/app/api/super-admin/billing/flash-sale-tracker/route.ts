import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  defaultFlashTrackerDateRange,
  getFlashSaleTracker,
} from "@/lib/db/operations/flash-sale-tracker";

export const runtime = "nodejs";

const emptyPayload = (warning?: string) => {
  const range = defaultFlashTrackerDateRange();
  return {
    range,
    summary: {
      total_redemptions: 0,
      reserved: 0,
      consumed: 0,
      cancelled: 0,
      refunded: 0,
      unique_customers: 0,
      subsidy_spent: 0,
      food_count: 0,
      ride_count: 0,
      parcel_count: 0,
      blocked_attempts: 0,
    },
    rows: [],
    ...(warning ? { warning } : {}),
  };
};

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  try {
    const data = await getFlashSaleTracker({
      from: from || undefined,
      to: to || undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load Flash Sale tracker";
    return NextResponse.json(emptyPayload(msg), { status: 200 });
  }
}
