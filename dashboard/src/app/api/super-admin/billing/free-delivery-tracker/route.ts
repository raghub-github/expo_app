import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  defaultFreeDeliveryTrackerDateRange,
  getFreeDeliveryTracker,
} from "@/lib/db/operations/free-delivery-tracker";

export const runtime = "nodejs";

const emptyPayload = (warning?: string) => {
  const range = defaultFreeDeliveryTrackerDateRange();
  return {
    range,
    summary: {
      total_offers: 0,
      active_offers: 0,
      eligible_customers: null,
      orders_applied: 0,
      successful_redemptions: 0,
      unique_customers: 0,
      delivery_fees_waived: 0,
      budget_consumed: 0,
      budget_remaining: null,
      avg_discount_per_order: null,
      cancelled_refunded_redemptions: 0,
      conversion_rate: null,
      reserved: 0,
      consumed: 0,
    },
    perOffer: [],
    redemptions: [],
    daily: [],
    budgetChart: { consumed: 0, remaining: null, total: 0 },
    auditLogs: [],
    conflicts: [],
    ...(warning ? { warning } : {}),
  };
};

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  try {
    const data = await getFreeDeliveryTracker({
      from: from || undefined,
      to: to || undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load Free Delivery tracker";
    return NextResponse.json(emptyPayload(msg), { status: 200 });
  }
}
