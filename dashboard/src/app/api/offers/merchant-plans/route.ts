/**
 * Merchant Plans API
 * GET - List plans with search, filters, pagination
 * POST - Create new plan
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

function toPlanRow(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    planName: row.plan_name as string,
    planCode: row.plan_code as string,
    planType: (row.plan_type as string) ?? "MERCHANT",
    description: (row.description as string) ?? null,
    price: Number(row.price ?? 0),
    gstPercent: row.gst_percent != null ? String(row.gst_percent) : "0",
    billingCycle: (row.billing_cycle as string) ?? "MONTHLY",
    maxMenuItems: row.max_menu_items != null ? Number(row.max_menu_items) : null,
    maxCuisines: row.max_cuisines != null ? Number(row.max_cuisines) : null,
    maxMenuCategories: row.max_menu_categories != null ? Number(row.max_menu_categories) : null,
    imageUploadAllowed: Boolean(row.image_upload_allowed),
    maxImageUploads: row.max_image_uploads != null ? Number(row.max_image_uploads) : null,
    analyticsAccess: Boolean(row.analytics_access),
    advancedAnalytics: Boolean(row.advanced_analytics),
    prioritySupport: Boolean(row.priority_support),
    marketingAutomation: Boolean(row.marketing_automation),
    customApiIntegrations: Boolean(row.custom_api_integrations),
    dedicatedAccountManager: Boolean(row.dedicated_account_manager),
    displayOrder: row.display_order != null ? Number(row.display_order) : null,
    isActive: Boolean(row.is_active),
    isPopular: Boolean(row.is_popular),
    sheetBadgeLabel: (row.sheet_badge_label as string) ?? null,
    sheetHeadline: (row.sheet_headline as string) ?? null,
    sheetCtaLabel: (row.sheet_cta_label as string) ?? null,
    benefitsJson: row.benefits_json ?? [],
    createdAt: (row.created_at as string) ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const planType = (searchParams.get("type") || "MERCHANT").toUpperCase();
    if (!["MERCHANT", "RIDER", "CUSTOMER"].includes(planType)) {
      return NextResponse.json({ success: false, error: "Invalid type" }, { status: 400 });
    }
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));

    const sql = getSql() as { unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]> };

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    conditions.push(`p.plan_type = $${p}::public.subscription_plan_type`);
    params.push(planType);
    p++;

    if (search) {
      conditions.push(`(p.plan_name ILIKE $${p} OR p.plan_code ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }
    if (status === "active") {
      conditions.push(`p.is_active = true`);
    } else if (status === "inactive") {
      conditions.push(`p.is_active = false`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [countRow] = await sql.unsafe(
      `SELECT COUNT(*)::int AS c FROM merchant_plans p ${whereClause}`,
      [...params]
    );
    const total = (countRow as { c: number })?.c ?? 0;

    const rows = await sql.unsafe(
      `SELECT p.* FROM merchant_plans p
       ${whereClause}
       ORDER BY p.display_order NULLS LAST, p.created_at DESC
       LIMIT $${p} OFFSET $${p + 1}`,
      [...params, limit, offset]
    );

    const plans = (rows as Record<string, unknown>[]).map(toPlanRow);

    return NextResponse.json({
      success: true,
      data: { plans, total },
    });
  } catch (error) {
    console.error("[offers/merchant-plans API] GET error:", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) {
      return NextResponse.json({ success: false, error: "Only super admins can create plans" }, { status: 403 });
    }

    const body = await request.json();
    const {
      planName,
      planCode,
      description,
      price = 0,
      gstPercent = "0",
      planType = "MERCHANT",
      billingCycle = "MONTHLY",
      maxMenuItems,
      maxCuisines,
      maxMenuCategories,
      imageUploadAllowed = false,
      maxImageUploads = 0,
      analyticsAccess = false,
      advancedAnalytics = false,
      prioritySupport = false,
      marketingAutomation = false,
      customApiIntegrations = false,
      dedicatedAccountManager = false,
      displayOrder,
      isActive = true,
      isPopular = false,
      sheetBadgeLabel,
      sheetHeadline,
      sheetCtaLabel,
      benefitsJson,
    } = body;

    if (!planName || !planCode) {
      return NextResponse.json(
        { success: false, error: "Plan name and plan code are required" },
        { status: 400 }
      );
    }

    const pt = String(planType).toUpperCase();
    if (!["MERCHANT", "RIDER", "CUSTOMER"].includes(pt)) {
      return NextResponse.json({ success: false, error: "planType must be MERCHANT|RIDER|CUSTOMER" }, { status: 400 });
    }

    const gp = Number(gstPercent);
    if (!Number.isFinite(gp) || gp < 0 || gp > 100) {
      return NextResponse.json({ success: false, error: "gstPercent must be 0–100" }, { status: 400 });
    }

    const code = String(planCode).trim().toUpperCase().replace(/\s+/g, "_");
    const allowedCycles = ["MONTHLY", "QUARTERLY", "SEMI_YEARLY", "YEARLY"] as const;
    const cycleRaw = String(billingCycle).toUpperCase().replace(/-/g, "_");
    const validBilling = (allowedCycles as readonly string[]).includes(cycleRaw)
      ? cycleRaw
      : "MONTHLY";

    const benefitsPayload = Array.isArray(benefitsJson)
      ? benefitsJson
      : typeof benefitsJson === "string"
        ? benefitsJson.split("\n").map((s: string) => s.trim()).filter(Boolean)
        : [];

    const sql = getSql();
    const [inserted] = await sql`
      INSERT INTO merchant_plans (
        plan_type, plan_name, plan_code, description, price, gst_percent, billing_cycle,
        max_menu_items, max_cuisines, max_menu_categories,
        image_upload_allowed, max_image_uploads,
        analytics_access, advanced_analytics, priority_support,
        marketing_automation, custom_api_integrations, dedicated_account_manager,
        display_order, is_active, is_popular,
        sheet_badge_label, sheet_headline, sheet_cta_label, benefits_json
      )
      VALUES (
        ${pt}::public.subscription_plan_type,
        ${String(planName).trim()},
        ${code},
        ${description ? String(description).trim() : null},
        ${Number(price) || 0},
        ${gp},
        ${validBilling}::public.billing_cycle_type,
        ${maxMenuItems != null ? Number(maxMenuItems) : null},
        ${maxCuisines != null ? Number(maxCuisines) : null},
        ${maxMenuCategories != null ? Number(maxMenuCategories) : null},
        ${Boolean(imageUploadAllowed)},
        ${maxImageUploads != null ? Number(maxImageUploads) : null},
        ${Boolean(analyticsAccess)},
        ${Boolean(advancedAnalytics)},
        ${Boolean(prioritySupport)},
        ${Boolean(marketingAutomation)},
        ${Boolean(customApiIntegrations)},
        ${Boolean(dedicatedAccountManager)},
        ${displayOrder != null ? Number(displayOrder) : null},
        ${Boolean(isActive)},
        ${Boolean(isPopular)},
        ${sheetBadgeLabel ? String(sheetBadgeLabel).trim() : null},
        ${sheetHeadline ? String(sheetHeadline).trim() : null},
        ${sheetCtaLabel ? String(sheetCtaLabel).trim() : null},
        ${JSON.stringify(benefitsPayload)}::jsonb
      )
      RETURNING *
    `;

    const plan = toPlanRow(inserted as Record<string, unknown>);
    return NextResponse.json({ success: true, data: plan }, { status: 201 });
  } catch (error: unknown) {
    console.error("[offers/merchant-plans API] POST error:", error);
    const err = error as { code?: string; constraint?: string };
    if (err?.code === "23505") {
      return NextResponse.json(
        { success: false, error: "Plan code or plan name already exists" },
        { status: 409 }
      );
    }
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
