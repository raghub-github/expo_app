/**
 * Merchant Plan by ID
 * GET, PUT, PATCH, DELETE
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
    description: (row.description as string) ?? null,
    price: Number(row.price ?? 0),
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
    createdAt: (row.created_at as string) ?? null,
  };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, error: "Invalid plan ID" }, { status: 400 });

    const sql = getSql();
    const [row] = await sql`SELECT * FROM merchant_plans WHERE id = ${id}`;
    if (!row) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: toPlanRow(row as Record<string, unknown>) });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) return NextResponse.json({ success: false, error: "Only super admins can update plans" }, { status: 403 });

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, error: "Invalid plan ID" }, { status: 400 });

    const body = await request.json();
    const sql = getSql();

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fields: Array<{ key: string; db: string; fn?: (v: unknown) => unknown }> = [
      { key: "planName", db: "plan_name" },
      { key: "planCode", db: "plan_code", fn: (v) => v ? String(v).trim().toUpperCase().replace(/\s+/g, "_") : v },
      { key: "description", db: "description" },
      { key: "price", db: "price", fn: (v) => v != null ? Number(v) : v },
      { key: "billingCycle", db: "billing_cycle" },
      { key: "maxMenuItems", db: "max_menu_items", fn: (v) => v != null ? Number(v) : v },
      { key: "maxCuisines", db: "max_cuisines", fn: (v) => v != null ? Number(v) : v },
      { key: "maxMenuCategories", db: "max_menu_categories", fn: (v) => v != null ? Number(v) : v },
      { key: "imageUploadAllowed", db: "image_upload_allowed", fn: (v) => v != null ? Boolean(v) : v },
      { key: "maxImageUploads", db: "max_image_uploads", fn: (v) => v != null ? Number(v) : v },
      { key: "analyticsAccess", db: "analytics_access", fn: (v) => v != null ? Boolean(v) : v },
      { key: "advancedAnalytics", db: "advanced_analytics", fn: (v) => v != null ? Boolean(v) : v },
      { key: "prioritySupport", db: "priority_support", fn: (v) => v != null ? Boolean(v) : v },
      { key: "marketingAutomation", db: "marketing_automation", fn: (v) => v != null ? Boolean(v) : v },
      { key: "customApiIntegrations", db: "custom_api_integrations", fn: (v) => v != null ? Boolean(v) : v },
      { key: "dedicatedAccountManager", db: "dedicated_account_manager", fn: (v) => v != null ? Boolean(v) : v },
      { key: "displayOrder", db: "display_order", fn: (v) => v != null ? Number(v) : v },
      { key: "isActive", db: "is_active", fn: (v) => v != null ? Boolean(v) : v },
      { key: "isPopular", db: "is_popular", fn: (v) => v != null ? Boolean(v) : v },
    ];

    for (const { key, db, fn } of fields) {
      if (body[key] !== undefined) {
        const val = fn ? fn(body[key]) : body[key];
        updates.push(`${db} = $${idx++}`);
        values.push(val);
      }
    }

    if (updates.length === 0) return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });

    values.push(id);
    const setClause = updates.join(", ");
    const sqlClient = sql as { unsafe: (q: string, v: unknown[]) => Promise<Record<string, unknown>[]> };
    const [updated] = await sqlClient.unsafe(
      `UPDATE merchant_plans SET ${setClause}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!updated) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: toPlanRow(updated as Record<string, unknown>) });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "23505") return NextResponse.json({ success: false, error: "Plan code or plan name already exists" }, { status: 409 });
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) return NextResponse.json({ success: false, error: "Only super admins can update plans" }, { status: 403 });

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, error: "Invalid plan ID" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const isActive = body.isActive;
    if (typeof isActive !== "boolean") return NextResponse.json({ success: false, error: "isActive (boolean) required" }, { status: 400 });

    const sql = getSql();
    const [updated] = await sql`UPDATE merchant_plans SET is_active = ${isActive}, updated_at = NOW() WHERE id = ${id} RETURNING *`;
    if (!updated) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: toPlanRow(updated as Record<string, unknown>) });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) return NextResponse.json({ success: false, error: "Only super admins can delete plans" }, { status: 403 });

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ success: false, error: "Invalid plan ID" }, { status: 400 });

    const sql = getSql();
    const [row] = await sql`UPDATE merchant_plans SET is_active = false, updated_at = NOW() WHERE id = ${id} RETURNING id`;
    if (!row) return NextResponse.json({ success: false, error: "Plan not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: { message: "Plan deleted successfully", id: (row as { id: number }).id } });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
