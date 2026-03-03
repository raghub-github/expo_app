/**
 * GET /api/merchant/stores
 * Unified listing endpoint for parent/child merchants for the Dashboard merchant section.
 *
 * Query params:
 * - filter: "parent" | "child" (default: "child")
 * - search: string (optional)
 * - limit: number (default: 20, max: 100)
 * - cursor: string (optional)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { listMerchantParents, listMerchantStores, getChildMerchantStores } from "@/lib/db/operations/merchant-stores";
import { getSystemUserEmailsByIds } from "@/lib/db/operations/users";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant dashboard access required",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const filter = (searchParams.get("filter") as "parent" | "child" | null) ?? "child";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const cursor = searchParams.get("cursor") ?? undefined;
    const rawSearch = searchParams.get("search");
    const search = rawSearch != null ? rawSearch.trim() || undefined : undefined;
    const category = searchParams.get("category") as "verified" | "pending" | "rejected" | "new" | null;
    const fromDate = searchParams.get("fromDate")?.trim() || undefined;
    const toDate = searchParams.get("toDate")?.trim() || undefined;

    // Scope: Area managers see only their stores; Super Admin / other users see all.
    let areaManagerId: number | null = null;
    const superAdmin = await isSuperAdmin(user.id, user.email);
    if (!superAdmin) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }

    if (filter === "parent") {
      const { items, nextCursor } = await listMerchantParents({
        areaManagerId,
        limit,
        cursor,
        search,
      });
      const allChildren = await Promise.all(
        items.map((p) => getChildMerchantStores(p.id, areaManagerId))
      );
      const approvedByIds = [...new Set(allChildren.flat().map((s) => s.approved_by).filter((id): id is number => id != null))];
      const verifiedByEmails = await getSystemUserEmailsByIds(approvedByIds);
      const itemsWithChildren = items.map((p, idx) => {
        const children = allChildren[idx];
        return {
          type: "parent" as const,
          id: p.id,
          merchant_id: p.parent_merchant_id,
          name: p.parent_name,
          phone: p.registered_phone,
          city: p.city,
          approval_status: p.approval_status,
          children: children.map((s) => ({
            type: "child" as const,
            id: s.id,
            store_id: s.store_id,
            parent_id: s.parent_id,
            name: s.store_display_name || s.store_name,
            city: s.city,
            approval_status: s.approval_status,
            onboarding_step: s.current_onboarding_step,
            onboarding_completed: s.onboarding_completed,
            store_email: s.store_email ?? null,
            store_phones: s.store_phones ?? null,
            created_at: s.created_at ? new Date(s.created_at).toISOString() : null,
            verified_by_email: s.approved_by != null ? verifiedByEmails.get(s.approved_by) ?? null : null,
          })),
        };
      });
      return NextResponse.json({
        success: true,
        filter: "parent",
        items: itemsWithChildren,
        nextCursor,
      });
    }

    // Map category to approval_status / newOnly for child list
    let approval_status: string | undefined;
    let newOnly = false;
    if (category === "verified") approval_status = "APPROVED";
    else if (category === "pending") approval_status = "SUBMITTED";
    else if (category === "rejected") approval_status = "REJECTED";
    else if (category === "new") newOnly = true;

    // Child search: return only matching child store(s); limit 1 for "single child" result when search is set
    const { items, nextCursor } = await listMerchantStores({
      areaManagerId,
      limit: search ? 1 : limit,
      cursor,
      search,
      filter: "child",
      approval_status,
      newOnly,
      createdFrom: fromDate,
      createdTo: toDate,
    });
    const approvedByIds = [...new Set(items.map((s) => s.approved_by).filter((id): id is number => id != null))];
    const verifiedByEmails = await getSystemUserEmailsByIds(approvedByIds);
    return NextResponse.json({
      success: true,
      filter: "child",
      items: items.map((s) => ({
        type: "child" as const,
        id: s.id,
        store_id: s.store_id,
        parent_id: s.parent_id,
        name: s.store_display_name || s.store_name,
        city: s.city,
        approval_status: s.approval_status,
        onboarding_step: s.current_onboarding_step,
        onboarding_completed: s.onboarding_completed,
        store_email: s.store_email ?? null,
        store_phones: s.store_phones ?? null,
        created_at: s.created_at ? new Date(s.created_at).toISOString() : null,
        verified_by_email: s.approved_by != null ? verifiedByEmails.get(s.approved_by) ?? null : null,
      })),
      nextCursor,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

