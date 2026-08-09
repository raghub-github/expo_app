import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { backendFetch } from "@/lib/notif-backend";
import { AUTO_ONLY_ADMIN_CX_CODES } from "@/lib/notifications/admin-cx-templates";

export const runtime = "nodejs";

type CxTemplateRow = {
  code: string;
  title_template: string | null;
  body_template: string | null;
  deep_link: string | null;
  priority: string | null;
  category: string | null;
};

const FALLBACK_LABELS: Record<string, string> = {
  ADMIN_CX_POST_PICKUP_LONG_DISTANCE: "Post Pickup | Delay due to long distance",
  ADMIN_CX_PRE_PICKUP_MERCHANT_UNRESPONSIVE: "Pre Pickup | Merchant is unresponsive",
  ADMIN_CX_POST_PICKUP_TRAFFIC: "Post Pickup | Delay due to traffic",
  ADMIN_CX_POST_PICKUP_RIDER_UNRESPONSIVE: "Post Pickup | Rider is unresponsive",
  ADMIN_CX_PRE_PICKUP_STORE_ISSUE: "Pre Pickup | Electricity / Any other issue at the store",
  ADMIN_CX_PRE_PICKUP_DISPATCH_READY:
    "Pre Pickup | Order marked as Dispatch Ready / Rider is on the way",
  ADMIN_CX_POST_PICKUP_ADDRESS_CONFIRM: "Post Pickup | Customer Address Confirmation",
  ADMIN_CX_PRE_PICKUP_HIGH_FOOTFALL: "Pre Pickup | High footfall at the store",
  ADMIN_CX_PRE_PICKUP_RIDER_UNRESPONSIVE: "Pre Pickup | Rider is unresponsive",
  ADMIN_CX_POST_PICKUP_RAIN: "Post Pickup | Delay due to rain",
  ADMIN_CX_POST_PICKUP_CUSTOMER_UNRESPONSIVE: "Post Pickup | Customer is unresponsive",
  ADMIN_CX_POST_PICKUP_ON_THE_WAY: "Post Pickup | Order is on the way",
  ADMIN_CX_PRE_PICKUP_RAIN: "Pre Pickup | Delay due to rain",
  ADMIN_CX_PRE_PICKUP_RIDER_CANT_FIND_STORE: "Pre Pickup | Rider is unable to find the store",
  ADMIN_CX_PRE_PICKUP_ITEM_SLOW: "Pre Pickup | Item is taking longer to prepare",
  ADMIN_CX_CUSTOM: "Custom Message",
};

/** Lifecycle events sent automatically by the system — not for manual admin push. */
const AUTO_ONLY = AUTO_ONLY_ADMIN_CX_CODES;


function labelFor(code: string, labels: Record<string, string>): string {
  return (
    labels[code] ||
    FALLBACK_LABELS[code] ||
    code.replace(/^ADMIN_CX_/, "").replace(/_/g, " ")
  );
}

async function loadTemplatesFromDb() {
  const sql = getSql();
  const rows = (await sql`
    SELECT code, title_template, body_template, deep_link, priority, category
    FROM public.notification_templates
    WHERE enabled = true
      AND role = 'customer'
      AND code LIKE 'ADMIN_CX_%'
    ORDER BY code, locale
  `) as unknown as CxTemplateRow[];

  let labels: Record<string, string> = {};
  try {
    const settings = (await sql`
      SELECT value FROM public.notification_settings
      WHERE key = 'admin_cx_template_labels'
      LIMIT 1
    `) as unknown as Array<{ value: unknown }>;
    const raw = settings[0]?.value;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      labels = raw as Record<string, string>;
    } else if (typeof raw === "string") {
      labels = JSON.parse(raw) as Record<string, string>;
    }
  } catch {
    labels = {};
  }

  const seen = new Set<string>();
  const items = [];
  for (const t of rows) {
    if (seen.has(t.code)) continue;
    if (AUTO_ONLY.has(t.code)) continue;
    seen.add(t.code);
    items.push({
      code: t.code,
      label: labelFor(t.code, labels),
      title_template: t.title_template ?? "",
      body_template: t.body_template ?? "",
      deep_link: t.deep_link,
      priority: t.priority,
      category: t.category,
      allow_edit: true,
      is_custom: t.code === "ADMIN_CX_CUSTOM",
    });
  }

  items.sort((a, b) => {
    if (a.is_custom) return 1;
    if (b.is_custom) return -1;
    return a.label.localeCompare(b.label);
  });

  return items;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PERSON_RIDE")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PARCEL"));

    if (!allowed) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // Prefer DB (same source as migrations) so the dropdown works even if backend is down.
    try {
      const items = await loadTemplatesFromDb();
      if (items.length > 0) {
        return NextResponse.json({ success: true, items });
      }
    } catch (dbErr) {
      console.warn("[cx-notification-templates] DB load failed, trying backend:", dbErr);
    }

    const { status, body } = await backendFetch("/v1/admin/orders/notification-templates");
    if (status >= 400) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to load templates",
          details: body,
        },
        { status }
      );
    }

    const items =
      body && typeof body === "object" && Array.isArray((body as { items?: unknown }).items)
        ? (body as { items: Array<{ code?: string }> }).items.filter(
            (t) => t?.code && !AUTO_ONLY_ADMIN_CX_CODES.has(String(t.code))
          )
        : [];

    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("[GET /api/orders/cx-notification-templates]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
