/**
 * Customer subscription plans admin API (GMitra Plus)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { apiErrorResponse } from "@/lib/api-errors";
import { loadPlanDetails } from "@/lib/subscription-plans/load-plan-details";
import { loadPlansListForAudience, loadCustomerSubscriptionStats } from "@/lib/subscription-plans/load-plans-list";

export const runtime = "nodejs";

async function clearOtherFeatured(sql: ReturnType<typeof getSql>, planId: number) {
  await sql`
    UPDATE subscription_plans
    SET is_featured = false, updated_at = NOW()
    WHERE plan_audience = 'CUSTOMER' AND id != ${planId} AND is_featured = true
  `;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const search = request.nextUrl.searchParams.get("search")?.trim() || "";
    const plans = await loadPlansListForAudience("CUSTOMER", search || undefined);

    let stats: Record<string, unknown> | null = null;
    if (request.nextUrl.searchParams.get("stats") === "1") {
      const customerStats = await loadCustomerSubscriptionStats();
      const activeCount = plans.filter((p) => p.isActive).length;
      stats = {
        activePlans: activeCount,
        totalPlans: plans.length,
        ...customerStats,
      };
    }

    return NextResponse.json({ success: true, data: { plans, total: plans.length, stats } });
  } catch (error) {
    console.error("[customer-subscription-plans] GET", error);
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
    if (!(await isSuperAdmin(user.id, user.email ?? ""))) {
      return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
    }

    const body = await request.json();
    const {
      code,
      name,
      description,
      badgeText,
      badgeColor = "#059669",
      headline,
      ctaLabel = "Add Plus",
      isActive = true,
      isFeatured = false,
      displayOrder = 0,
      defaultBillingCycle = "monthly",
      freeDeliveryEnabled = false,
      maxFreeDeliveryRadiusKm = 7,
      discountPercentage,
      cashbackEnabled = false,
      cashbackPercentage,
      prioritySupport = false,
      prices = [],
      benefits = [],
    } = body;

    if (!code || !name) {
      return NextResponse.json({ success: false, error: "code and name required" }, { status: 400 });
    }

    const sql = getSql();
    const [inserted] = await sql`
      INSERT INTO subscription_plans (
        code, name, description, badge_text, badge_color, headline, cta_label,
        is_active, display_order, default_billing_cycle, plan_audience,
        is_featured, free_delivery_enabled, max_free_delivery_radius_km,
        discount_percentage, cashback_enabled, cashback_percentage, priority_support
      )
      VALUES (
        ${String(code).trim().toUpperCase()},
        ${String(name).trim()},
        ${description ? String(description).trim() : null},
        ${badgeText ? String(badgeText).trim() : null},
        ${String(badgeColor)},
        ${headline ? String(headline).trim() : null},
        ${String(ctaLabel).trim()},
        ${Boolean(isActive)},
        ${Number(displayOrder) || 0},
        ${String(defaultBillingCycle)}::public.subscription_billing_cycle,
        'CUSTOMER'::public.subscription_plan_audience,
        ${Boolean(isFeatured)},
        ${Boolean(freeDeliveryEnabled)},
        ${Number(maxFreeDeliveryRadiusKm) || 7},
        ${discountPercentage != null && discountPercentage !== "" ? Number(discountPercentage) : null},
        ${Boolean(cashbackEnabled)},
        ${cashbackPercentage != null && cashbackPercentage !== "" ? Number(cashbackPercentage) : null},
        ${Boolean(prioritySupport)}
      )
      RETURNING id
    `;
    const planId = Number((inserted as { id: number }).id);

    if (isFeatured) {
      await clearOtherFeatured(sql, planId);
    }

    for (const price of prices as Array<Record<string, unknown>>) {
      if (!price.billingCycle || price.amount == null || String(price.amount).trim() === "") continue;
      await sql`
        INSERT INTO subscription_plan_prices (plan_id, billing_cycle, amount, gst_percent, auto_wallet_deduction, is_active)
        VALUES (
          ${planId},
          ${String(price.billingCycle)}::public.subscription_billing_cycle,
          ${Number(price.amount) || 0},
          ${Number(price.gstPercent) || 18},
          false,
          ${price.isActive !== false}
        )
        ON CONFLICT (plan_id, billing_cycle) DO UPDATE SET
          amount = EXCLUDED.amount,
          gst_percent = EXCLUDED.gst_percent,
          is_active = EXCLUDED.is_active
      `;
    }

    for (const benefit of benefits as Array<Record<string, unknown>>) {
      if (!benefit.benefitKey) continue;
      await sql`
        INSERT INTO subscription_plan_benefits (plan_id, benefit_key, benefit_value, display_label, display_order)
        VALUES (
          ${planId},
          ${String(benefit.benefitKey).trim()},
          ${String(benefit.benefitValue ?? "")},
          ${benefit.displayLabel ? String(benefit.displayLabel).trim() : null},
          ${Number(benefit.displayOrder) || 0}
        )
        ON CONFLICT (plan_id, benefit_key) DO UPDATE SET
          benefit_value = EXCLUDED.benefit_value,
          display_label = EXCLUDED.display_label,
          display_order = EXCLUDED.display_order
      `;
    }

    const plan = await loadPlanDetails(planId);
    return NextResponse.json({ success: true, data: plan }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "23505") {
      return NextResponse.json({ success: false, error: "Plan code already exists" }, { status: 409 });
    }
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
