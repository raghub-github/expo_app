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
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
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
    const category = searchParams.get("category") as "verified" | "pending" | "rejected" | "new" | "drafted" | "resubmitted" | null;
    const fromDate = searchParams.get("fromDate")?.trim() || undefined;
    const toDate = searchParams.get("toDate")?.trim() || undefined;
    const storeType = searchParams.get("storeType")?.trim() || undefined;

    // Scope: AM-assigned stores only unless MERCHANT_VIEW / admin merchant access (org-wide).
    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });

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
            delisted_at: s.delisted_at ? new Date(s.delisted_at).toISOString() : null,
              store_type: s.store_type ?? null,
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
    let draftedOnly = false;
    let resubmittedOnly = false;
    if (category === "verified") approval_status = "APPROVED";
    else if (category === "pending") approval_status = "SUBMITTED";
    else if (category === "rejected") approval_status = "REJECTED";
    else if (category === "new") newOnly = true;
    else if (category === "drafted") draftedOnly = true;
    else if (category === "resubmitted") resubmittedOnly = true;

    // Child search: exact store-id hits usually return 1 row (redirect). Parent-id / fuzzy may return many.
    const { items, nextCursor } = await listMerchantStores({
      areaManagerId,
      limit,
      cursor,
      search,
      filter: "child",
      approval_status,
      newOnly,
      draftedOnly,
      resubmittedOnly,
      storeType,
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
        delisted_at: s.delisted_at ? new Date(s.delisted_at).toISOString() : null,
          store_type: s.store_type ?? null,
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

