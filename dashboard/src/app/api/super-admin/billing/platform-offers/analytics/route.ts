import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  defaultAnalyticsDateRange,
  getPlatformOfferAnalytics,
} from "@/lib/db/operations/platform-offer-analytics";

export const runtime = "nodejs";

const emptyPayload = (warning?: string) => {
  const range = defaultAnalyticsDateRange();
  return {
    range,
    summary: {
      total_offers: 0,
      active_offers: 0,
      total_redemptions: 0,
      active_users: 0,
      orders_applied: 0,
      sales_attributed: 0,
      discount_total: 0,
      budget_total: 0,
      budget_consumed: 0,
      budget_remaining: null as number | null,
    },
    perOffer: [],
    geoWise: [],
    daily: [],
    monthly: [],
    recentApplications: [],
    auditLogs: [],
    ...(warning ? { warning } : {}),
  };
};

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  try {
    const data = await getPlatformOfferAnalytics({
      from: from ?? undefined,
      to: to ?? undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    if (/platform_offer_usages|offer_order_applications|does not exist/i.test(msg)) {
      return NextResponse.json(
        emptyPayload(
          "Run platform offer migrations (0482/0492 usage + 0483/0493 analytics) to enable full analytics.",
        ),
      );
    }
    console.error("[platform-offers/analytics]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
