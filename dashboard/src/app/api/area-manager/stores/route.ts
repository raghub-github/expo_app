/**
 * GET /api/area-manager/stores - List stores (Merchant AM)
 * POST /api/area-manager/stores - Add store
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { listMerchantStores, listMerchantParents, countChildStoresForParent, countMerchantParentsWithFilters, countChildStores } from "@/lib/db/operations/merchant-stores";
import { createStore } from "@/lib/db/operations/stores";
import { logAreaManagerActivity } from "@/lib/area-manager/activity";
import { apiErrorResponse } from "@/lib/api-errors";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const getAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    };
    const authResult = await requireAreaManagerApiAuth(getAuthUser);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const { resolved } = authResult;
    // Super admin: null = overall list. Area manager: use real area_managers.id only.
    const areaManagerId = resolved.isSuperAdmin
      ? null
      : resolved.areaManager.id > 0
        ? resolved.areaManager.id
        : null;

    const searchParams = request.nextUrl.searchParams;
    const statusParam = searchParams.get("status");
    const status = statusParam as string | undefined;
    const search = searchParams.get("search") ?? undefined;
    const filter = searchParams.get("filter") as "parent" | "child" | undefined;
    const parentId = searchParams.get("parentId") ? parseInt(searchParams.get("parentId")!, 10) : undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    // Map UI status to approval_status (and store status for ACTIVE/INACTIVE)
    const approvalStatusValues = ["DRAFT", "SUBMITTED", "UNDER_VERIFICATION", "APPROVED", "REJECTED", "DELISTED", "BLOCKED"];
    const isApprovalStatus = status && approvalStatusValues.includes(status);
    const isPending = status === "PENDING";
    const isVerified = status === "VERIFIED" || status === "APPROVED";
    let approval_status: string | undefined;
    if (isPending || status === "SUBMITTED") {
      approval_status = "SUBMITTED"; // PENDING group: DRAFT, SUBMITTED, UNDER_VERIFICATION
    } else if (isVerified) {
      approval_status = "APPROVED";
    } else if (status === "REJECTED") {
      approval_status = "REJECTED";
    } else if (isApprovalStatus) {
      approval_status = status;
    }
    const storeStatus = status === "ACTIVE" || status === "INACTIVE" ? status : undefined;

    // If filter is "parent", return merchant_parents list (parent_approval_status: APPROVED, REJECTED, BLOCKED, SUSPENDED only)
    if (filter === "parent") {
      const parentAllowed = ["APPROVED", "REJECTED", "BLOCKED", "SUSPENDED"];
      const parentApprovalStatus =
        !storeStatus && status && parentAllowed.includes(status) ? status : undefined;

      const [{ items, nextCursor }, totalParentCount, totalChildCount] = await Promise.all([
        listMerchantParents({
          areaManagerId,
          limit,
          cursor,
          search,
          approval_status: parentApprovalStatus,
        }),
        countMerchantParentsWithFilters({ areaManagerId, search, approval_status: parentApprovalStatus }),
        countChildStores(areaManagerId),
      ]);

      // Map parent: return actual approval_status for display; city for City column
      const mappedItems = items.map((p) => ({
        id: p.id,
        storeId: p.parent_merchant_id,
        name: p.parent_name,
        ownerPhone: p.registered_phone ?? "",
        status: p.approval_status,
        city: p.city ?? null,
        localityCode: null as string | null,
        areaCode: null as string | null,
        parentStoreId: null as number | null,
        createdAt: new Date().toISOString(),
        isParent: true,
      }));

      // If any child onboarding is in progress (draft child store exists), expose it so UI can show
      // "Complete onboarding" instead of "Add Child".
      try {
        const parentIds = mappedItems.map((p) => p.id).filter((id) => Number.isFinite(id));
        if (parentIds.length > 0) {
          const sql = getSql() as {
            unsafe: (q: string, v?: unknown[]) => Promise<unknown[]>;
          };

          // NOTE: Some Postgres clients do not reliably coerce JS arrays to bigint[] with sql.unsafe.
          // Use a deterministic IN (...) list built from numeric ids.
          const inList = parentIds.map((n) => Number(n)).filter(Number.isFinite).join(",");
          if (!inList) {
            throw new Error("No valid parent ids for pending child lookup");
          }

          // Pick the oldest DRAFT child per parent (most likely the active onboarding draft).
          const rows = (await sql.unsafe(
            `
            SELECT DISTINCT ON (parent_id)
              parent_id,
              id AS store_internal_id,
              current_onboarding_step
            FROM merchant_stores
            WHERE parent_id IN (${inList})
              AND approval_status = 'DRAFT'
            ORDER BY parent_id, created_at ASC
          `
          )) as { parent_id: number; store_internal_id: number; current_onboarding_step: number | null }[];

          const byParent = new Map<number, { storeInternalId: number; currentOnboardingStep: number | null }>();
          for (const r of rows || []) {
            if (!Number.isFinite(Number(r.parent_id)) || !Number.isFinite(Number(r.store_internal_id))) continue;
            byParent.set(Number(r.parent_id), {
              storeInternalId: Number(r.store_internal_id),
              currentOnboardingStep: r.current_onboarding_step ?? null,
            });
          }

          for (const p of mappedItems as any[]) {
            const pending = byParent.get(p.id);
            if (pending) {
              p.pendingChildStoreInternalId = pending.storeInternalId;
              p.pendingChildOnboardingStep = pending.currentOnboardingStep;
              p.totalSteps = 9;
            }
          }
        }
      } catch (e) {
        console.warn("[GET /api/area-manager/stores] pending child lookup failed:", e);
      }
      return NextResponse.json({
        success: true,
        data: { items: mappedItems, nextCursor, totalParentCount, totalChildCount },
      });
    }

    const { items, nextCursor } = await listMerchantStores({
      areaManagerId,
      limit,
      cursor,
      approval_status: storeStatus ? undefined : approval_status,
      status: storeStatus,
      search,
      filter: filter === "child" ? "child" : undefined,
      parentId,
    });

    let totalCount: number | undefined;
    let totalParentCount: number | undefined;
    let totalChildCount: number | undefined;
    if (filter === "child" && parentId != null) {
      totalCount = await countChildStoresForParent({
        areaManagerId,
        parentId,
        approval_status: storeStatus ? undefined : approval_status,
        status: storeStatus,
        search,
      });
    } else if (parentId == null) {
      [totalParentCount, totalChildCount] = await Promise.all([
        countMerchantParentsWithFilters({ areaManagerId }),
        countChildStores(areaManagerId),
      ]);
    }

    // Map merchant_stores rows: return actual approval_status for display; city for City column.
    // Also expose current_onboarding_step so UI can show step progress for drafts.
    const mappedItems = items.map((s) => ({
      id: s.id,
      storeId: s.store_id,
      name: s.store_display_name ?? s.store_name,
      ownerPhone: Array.isArray(s.store_phones) ? (s.store_phones[0] ?? "") : "",
      status: s.approval_status,
      storeStatus: s.status,
      city: s.city ?? null,
      localityCode: null as string | null,
      areaCode: null as string | null,
      parentStoreId: s.parent_id,
      createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
      isParent: false,
      currentOnboardingStep: s.current_onboarding_step,
      onboardingCompleted: s.onboarding_completed,
      onboardingCompletedAt: s.onboarding_completed_at,
      totalSteps: 9 as number | null,
    }));

    return NextResponse.json({
      success: true,
      data: { items: mappedItems, nextCursor, totalCount, totalParentCount, totalChildCount },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/stores]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const getAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    };
    const authResult = await requireAreaManagerApiAuth(getAuthUser);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const { resolved } = authResult;
    if (resolved.isSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Super admin must assign an area manager for the store" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { storeId, name, ownerPhone, parentStoreId, status, localityCode, areaCode } = body;
    if (!storeId || !name || !ownerPhone) {
      return NextResponse.json(
        { success: false, error: "storeId, name, and ownerPhone are required" },
        { status: 400 }
      );
    }

    const store = await createStore({
      storeId: String(storeId).trim(),
      name: String(name).trim(),
      ownerPhone: String(ownerPhone).trim(),
      areaManagerId: resolved.areaManager.id,
      parentStoreId: parentStoreId != null ? Number(parentStoreId) : null,
      status: status === "VERIFIED" || status === "REJECTED" ? status : "PENDING",
      localityCode: localityCode?.trim() ?? null,
      areaCode: areaCode?.trim() ?? null,
      createdBy: resolved.systemUserId,
    });

    await logAreaManagerActivity({
      actorId: resolved.systemUserId,
      action: "STORE_CREATED",
      entityType: "store",
      entityId: store.id,
    });

    return NextResponse.json({
      success: true,
      data: store,
    });
  } catch (error) {
    console.error("[POST /api/area-manager/stores]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
