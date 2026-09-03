import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";
import { CUSTOMER_HOME_SERVICES } from "@/lib/notifications/customer-home-services";

export const runtime = "nodejs";

/** Fallback if notification backend is down — same canonical list. */
export async function GET(_req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const { status, body } = await backendFetch("/v1/notifications/customer-home-services");
    if (status >= 200 && status < 300 && body && typeof body === "object") {
      return NextResponse.json(body, { status });
    }
  } catch {
    /* use local fallback */
  }
  return NextResponse.json({
    items: CUSTOMER_HOME_SERVICES.map((s) => ({
      id: s.id,
      label: s.label,
      deepLink: s.deepLink,
      storeType: s.storeType,
      supportsCategory: s.supportsCategory,
      supportsStore: s.supportsStore,
    })),
  });
}
