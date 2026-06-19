import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { apiErrorResponse } from "@/lib/api-errors";
import { loadPlanDetails } from "@/lib/subscription-plans/load-plan-details";

export const runtime = "nodejs";

async function clearOtherFeatured(sql: ReturnType<typeof getSql>, planId: number) {
  await sql`
    UPDATE subscription_plans
    SET is_featured = false, updated_at = NOW()
    WHERE plan_audience = 'CUSTOMER' AND id != ${planId} AND is_featured = true
  `;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!(await isSuperAdmin(user.id, user.email ?? ""))) {
      return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
    }

    const planId = parseInt((await params).id, 10);
    if (isNaN(planId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json();
    const sql = getSql();

    const [existing] = await sql`
      SELECT id FROM subscription_plans WHERE id = ${planId} AND plan_audience = 'CUSTOMER'
    `;
    if (!existing) {
      return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
    }

    if (body.name !== undefined) {
      await sql`UPDATE subscription_plans SET name = ${String(body.name).trim()}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.description !== undefined) {
      await sql`UPDATE subscription_plans SET description = ${body.description ? String(body.description).trim() : null}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.badgeText !== undefined) {
      await sql`UPDATE subscription_plans SET badge_text = ${body.badgeText ? String(body.badgeText).trim() : null}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.badgeColor !== undefined) {
      await sql`UPDATE subscription_plans SET badge_color = ${String(body.badgeColor)}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.headline !== undefined) {
      await sql`UPDATE subscription_plans SET headline = ${body.headline ? String(body.headline).trim() : null}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.ctaLabel !== undefined) {
      await sql`UPDATE subscription_plans SET cta_label = ${String(body.ctaLabel).trim()}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.isActive !== undefined) {
      await sql`UPDATE subscription_plans SET is_active = ${Boolean(body.isActive)}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.isFeatured !== undefined) {
      const featured = Boolean(body.isFeatured);
      await sql`UPDATE subscription_plans SET is_featured = ${featured}, updated_at = NOW() WHERE id = ${planId}`;
      if (featured) await clearOtherFeatured(sql, planId);
    }
    if (body.displayOrder !== undefined) {
      await sql`UPDATE subscription_plans SET display_order = ${Number(body.displayOrder) || 0}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.defaultBillingCycle !== undefined) {
      await sql`UPDATE subscription_plans SET default_billing_cycle = ${String(body.defaultBillingCycle)}::public.subscription_billing_cycle, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.freeDeliveryEnabled !== undefined) {
      await sql`UPDATE subscription_plans SET free_delivery_enabled = ${Boolean(body.freeDeliveryEnabled)}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.maxFreeDeliveryRadiusKm !== undefined) {
      await sql`UPDATE subscription_plans SET max_free_delivery_radius_km = ${Number(body.maxFreeDeliveryRadiusKm) || 7}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.discountPercentage !== undefined) {
      await sql`UPDATE subscription_plans SET discount_percentage = ${body.discountPercentage != null && body.discountPercentage !== "" ? Number(body.discountPercentage) : null}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.cashbackEnabled !== undefined) {
      await sql`UPDATE subscription_plans SET cashback_enabled = ${Boolean(body.cashbackEnabled)}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.cashbackPercentage !== undefined) {
      await sql`UPDATE subscription_plans SET cashback_percentage = ${body.cashbackPercentage != null && body.cashbackPercentage !== "" ? Number(body.cashbackPercentage) : null}, updated_at = NOW() WHERE id = ${planId}`;
    }
    if (body.prioritySupport !== undefined) {
      await sql`UPDATE subscription_plans SET priority_support = ${Boolean(body.prioritySupport)}, updated_at = NOW() WHERE id = ${planId}`;
    }

    if (Array.isArray(body.prices)) {
      for (const price of body.prices as Array<Record<string, unknown>>) {
        if (!price.billingCycle) continue;
        const amountRaw = price.amount;
        if (amountRaw == null || String(amountRaw).trim() === "") {
          await sql`
            UPDATE subscription_plan_prices SET is_active = false
            WHERE plan_id = ${planId} AND billing_cycle = ${String(price.billingCycle)}::public.subscription_billing_cycle
          `;
          continue;
        }
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
    }

    if (Array.isArray(body.benefits)) {
      const benefits = (body.benefits as Array<Record<string, unknown>>).filter((b) => b.benefitKey);
      await sql`DELETE FROM subscription_plan_benefits WHERE plan_id = ${planId}`;
      for (const benefit of benefits) {
        await sql`
          INSERT INTO subscription_plan_benefits (plan_id, benefit_key, benefit_value, display_label, display_order)
          VALUES (
            ${planId},
            ${String(benefit.benefitKey).trim()},
            ${String(benefit.benefitValue ?? "")},
            ${benefit.displayLabel ? String(benefit.displayLabel).trim() : null},
            ${Number(benefit.displayOrder) || 0}
          )
        `;
      }
    }

    const plan = await loadPlanDetails(planId);
    return NextResponse.json({ success: true, data: plan });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!(await isSuperAdmin(user.id, user.email ?? ""))) {
      return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
    }

    const planId = parseInt((await params).id, 10);
    const sql = getSql();
    await sql`
      UPDATE subscription_plans
      SET is_active = false, is_featured = false, updated_at = NOW()
      WHERE id = ${planId} AND plan_audience = 'CUSTOMER'
    `;
    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
