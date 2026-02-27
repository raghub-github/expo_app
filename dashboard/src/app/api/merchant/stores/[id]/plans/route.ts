/**
 * GET /api/merchant/stores/[id]/plans
 * Returns active merchant_plans and current subscription for this store (for Plans tab).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function getAreaManagerId(userId: string, email: string) {
  if (await isSuperAdmin(userId, email)) return null;
  const systemUser = await getSystemUserByEmail(email);
  if (!systemUser) return null;
  const am = await getAreaManagerByUserId(systemUser.id);
  return am?.id ?? null;
}

type PlanShape = {
  id: number;
  plan_name: string;
  plan_code: string;
  description: string | null;
  price: number;
  billing_cycle: string;
  max_menu_items: number | null;
  max_cuisines: number | null;
  max_menu_categories: number | null;
  image_upload_allowed: boolean;
  max_image_uploads: number | null;
  analytics_access: boolean;
  advanced_analytics: boolean;
  priority_support: boolean;
  marketing_automation: boolean;
  custom_api_integrations: boolean;
  dedicated_account_manager: boolean;
  display_order: number | null;
  is_active: boolean;
  is_popular: boolean;
};

function toPlan(row: Record<string, unknown>): PlanShape {
  return {
    id: Number(row.id),
    plan_name: row.plan_name as string,
    plan_code: row.plan_code as string,
    description: (row.description as string) ?? null,
    price: Number(row.price ?? 0),
    billing_cycle: (row.billing_cycle as string) ?? "MONTHLY",
    max_menu_items: row.max_menu_items != null ? Number(row.max_menu_items) : null,
    max_cuisines: row.max_cuisines != null ? Number(row.max_cuisines) : null,
    max_menu_categories: row.max_menu_categories != null ? Number(row.max_menu_categories) : null,
    image_upload_allowed: Boolean(row.image_upload_allowed),
    max_image_uploads: row.max_image_uploads != null ? Number(row.max_image_uploads) : null,
    analytics_access: Boolean(row.analytics_access),
    advanced_analytics: Boolean(row.advanced_analytics),
    priority_support: Boolean(row.priority_support),
    marketing_automation: Boolean(row.marketing_automation),
    custom_api_integrations: Boolean(row.custom_api_integrations),
    dedicated_account_manager: Boolean(row.dedicated_account_manager),
    display_order: row.display_order != null ? Number(row.display_order) : null,
    is_active: Boolean(row.is_active),
    is_popular: Boolean(row.is_popular),
  };
}

/** Default plans when merchant_plans table is empty so the UI always shows 3 cards with Free as selectable. */
function getDefaultPlans(): PlanShape[] {
  return [
    {
      id: 1,
      plan_name: "Free Plan",
      plan_code: "FREE",
      description: "Perfect for getting started",
      price: 0,
      billing_cycle: "MONTHLY",
      max_menu_items: 15,
      max_cuisines: 10,
      max_menu_categories: 10,
      image_upload_allowed: false,
      max_image_uploads: 0,
      analytics_access: true,
      advanced_analytics: false,
      priority_support: false,
      marketing_automation: false,
      custom_api_integrations: false,
      dedicated_account_manager: false,
      display_order: 0,
      is_active: true,
      is_popular: false,
    },
    {
      id: 2,
      plan_name: "Growth Plan",
      plan_code: "PREMIUM",
      description: "For growing businesses",
      price: 149,
      billing_cycle: "MONTHLY",
      max_menu_items: 40,
      max_cuisines: 25,
      max_menu_categories: 15,
      image_upload_allowed: true,
      max_image_uploads: 30,
      analytics_access: true,
      advanced_analytics: true,
      priority_support: true,
      marketing_automation: false,
      custom_api_integrations: false,
      dedicated_account_manager: false,
      display_order: 1,
      is_active: true,
      is_popular: true,
    },
    {
      id: 3,
      plan_name: "Pro Plan",
      plan_code: "ENTERPRISE",
      description: "For established businesses",
      price: 299,
      billing_cycle: "MONTHLY",
      max_menu_items: 70,
      max_cuisines: 35,
      max_menu_categories: 25,
      image_upload_allowed: true,
      max_image_uploads: 60,
      analytics_access: true,
      advanced_analytics: true,
      priority_support: true,
      marketing_automation: true,
      custom_api_integrations: true,
      dedicated_account_manager: true,
      display_order: 2,
      is_active: true,
      is_popular: false,
    },
  ];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }
    const areaManagerId = await getAreaManagerId(user.id, user.email);
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const sql = getSql();

    let planRows: Record<string, unknown>[] = [];
    try {
      const rows = await sql`
        SELECT id, plan_name, plan_code, description, price, billing_cycle,
               max_menu_items, max_cuisines, max_menu_categories,
               image_upload_allowed, max_image_uploads,
               analytics_access, advanced_analytics, priority_support, marketing_automation,
               custom_api_integrations, dedicated_account_manager,
               display_order, is_active, is_popular
        FROM merchant_plans
        WHERE is_active = true
        ORDER BY display_order NULLS LAST, created_at DESC
      `;
      planRows = Array.isArray(rows) ? rows : (rows ? [rows] : []);
    } catch {
      // merchant_plans may not exist or be empty
    }
    const plans: PlanShape[] =
      planRows.length > 0
        ? planRows.map((r) => toPlan(r as Record<string, unknown>))
        : getDefaultPlans();

    let currentSubscription: {
      plan_id: number;
      plan_name: string;
      plan_code: string;
      active_from: string;
      expiry_date: string | null;
      subscription_status?: string;
    } | null = null;

    try {
      const subRows = await sql`
        SELECT
          s.plan_id,
          p.plan_name,
          p.plan_code,
          COALESCE(s.billing_start_at, s.start_date) AS active_from,
          COALESCE(s.billing_end_at, s.expiry_date)   AS active_until,
          s.subscription_status
        FROM merchant_subscriptions s
        JOIN merchant_plans p ON p.id = s.plan_id
        WHERE s.store_id = ${storeId}
          AND s.subscription_status = 'ACTIVE'
          AND (s.is_active IS NULL OR s.is_active = true)
          AND COALESCE(s.billing_start_at, s.start_date) <= now()
          AND (
            COALESCE(s.billing_end_at, s.expiry_date) IS NULL
            OR COALESCE(s.billing_end_at, s.expiry_date) >= now()
          )
        ORDER BY COALESCE(s.billing_start_at, s.start_date) DESC
        LIMIT 1
      `;
      const subRow = Array.isArray(subRows) ? subRows[0] : subRows;
      if (subRow) {
        const r = subRow as Record<string, unknown>;
        const startDate = r.active_from;
        const expiryDate = r.active_until;
        currentSubscription = {
          plan_id: Number(r.plan_id),
          plan_name: (r.plan_name as string) ?? "Plan",
          plan_code: (r.plan_code as string) ?? "PLAN",
          active_from: startDate instanceof Date ? startDate.toISOString() : String(startDate ?? ""),
          expiry_date: expiryDate != null ? (expiryDate instanceof Date ? expiryDate.toISOString() : String(expiryDate)) : null,
          subscription_status: r.subscription_status as string,
        };
      }
    } catch {
      // merchant_subscriptions may not exist yet; fallback below
    }

    if (!currentSubscription) {
      try {
        const payRows = await sql`
          SELECT plan_id, plan_name, captured_at
          FROM merchant_onboarding_payments
          WHERE merchant_store_id = ${storeId}
            AND (razorpay_status = 'captured' OR status = 'captured')
            AND plan_id IS NOT NULL
          ORDER BY captured_at DESC NULLS LAST
          LIMIT 1
        `;
        const payRow = Array.isArray(payRows) ? payRows[0] : payRows;
        if (payRow) {
          const r = payRow as Record<string, unknown>;
          const capturedAt = r.captured_at;
          currentSubscription = {
            plan_id: Number(r.plan_id),
            plan_name: (r.plan_name as string) ?? "Plan",
            plan_code: (r.plan_name as string)?.replace(/\s+/g, "_").toUpperCase() ?? "PLAN",
            active_from: capturedAt instanceof Date ? capturedAt.toISOString() : String(capturedAt ?? ""),
            expiry_date: null,
          };
        }
      } catch {
        // ignore
      }
    }

    // When no paid subscription: treat Free plan as active so UI shows "Active" on Free card (merchant_plans + merchant_subscriptions)
    if (!currentSubscription && plans.length > 0) {
      const freePlan = plans.find(
        (p) => (p.plan_code && String(p.plan_code).toUpperCase() === "FREE") || Number(p.price) === 0
      );
      if (freePlan) {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        currentSubscription = {
          plan_id: freePlan.id,
          plan_name: freePlan.plan_name,
          plan_code: freePlan.plan_code,
          active_from: startOfMonth.toISOString(),
          expiry_date: null,
          subscription_status: "ACTIVE",
        };
      }
    }

    return NextResponse.json({
      success: true,
      plans,
      currentSubscription,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/plans]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
