/**
 * GET /api/area-manager/stores - List stores (Merchant AM)
 * POST /api/area-manager/stores - Add store
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { listMerchantStores, listMerchantParents } from "@/lib/db/operations/merchant-stores";
import { createStore } from "@/lib/db/operations/stores";
import { logAreaManagerActivity } from "@/lib/area-manager/activity";
import { apiErrorResponse } from "@/lib/api-errors";

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
    const areaManagerId = resolved.isSuperAdmin ? null : resolved.areaManager.id;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") as "VERIFIED" | "PENDING" | "REJECTED" | undefined;
    const search = searchParams.get("search") ?? undefined;
    const filter = searchParams.get("filter") as "parent" | "child" | undefined;
    const parentId = searchParams.get("parentId") ? parseInt(searchParams.get("parentId")!, 10) : undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
    const cursor = searchParams.get("cursor") ?? undefined;
    // Map UI status to approval_status
    // For merchant_stores: PENDING includes DRAFT, SUBMITTED, UNDER_VERIFICATION - handled in listMerchantStores
    // For merchant_parents: APPROVED = VERIFIED, REJECTED/BLOCKED/SUSPENDED = REJECTED, no PENDING status
    const approval_status =
      status === "VERIFIED"
        ? "APPROVED"
        : status === "PENDING"
          ? "SUBMITTED" // This will be expanded to include all pending statuses in listMerchantStores
          : status === "REJECTED"
            ? "REJECTED"
            : undefined;

    // If filter is "parent", return merchant_parents list
    if (filter === "parent") {
      // For parent stores, only apply status filter if status is VERIFIED or REJECTED (no PENDING)
      const parentApprovalStatus = status === "VERIFIED" || status === "REJECTED" ? approval_status : undefined;
      
      const { items, nextCursor } = await listMerchantParents({
        areaManagerId,
        limit,
        cursor,
        search,
        approval_status: parentApprovalStatus,
      });
      
      // Map parent approval_status to UI status
      const mappedItems = items.map((p) => {
        let uiStatus: "VERIFIED" | "PENDING" | "REJECTED" = "VERIFIED";
        if (p.approval_status === "APPROVED") {
          uiStatus = "VERIFIED";
        } else if (p.approval_status === "REJECTED" || p.approval_status === "BLOCKED" || p.approval_status === "SUSPENDED") {
          uiStatus = "REJECTED";
        }
        // Parent stores don't have PENDING status
        
        return {
          id: p.id,
          storeId: p.parent_merchant_id,
          name: p.parent_name,
          ownerPhone: p.registered_phone ?? "",
          status: uiStatus,
          localityCode: null as string | null,
          areaCode: null as string | null,
          parentStoreId: null as number | null,
          createdAt: new Date().toISOString(),
          isParent: true,
        };
      });
      return NextResponse.json({
        success: true,
        data: { items: mappedItems, nextCursor },
      });
    }

    const { items, nextCursor } = await listMerchantStores({
      areaManagerId,
      limit,
      cursor,
      approval_status,
      search,
      filter: filter === "child" ? "child" : undefined,
      parentId,
    });

    // Map merchant_stores rows to client shape (storeId, name, status as VERIFIED/PENDING/REJECTED, parentStoreId)
    const mappedItems = items.map((s) => ({
      id: s.id,
      storeId: s.store_id,
      name: s.store_display_name ?? s.store_name,
      ownerPhone: "", // merchant_stores has store_phones array; optional to expose
      status:
        s.approval_status === "APPROVED"
          ? "VERIFIED"
          : s.approval_status === "REJECTED"
            ? "REJECTED"
            : "PENDING",
      localityCode: null as string | null,
      areaCode: null as string | null,
      parentStoreId: s.parent_id,
      createdAt: s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
      isParent: false,
    }));

    return NextResponse.json({
      success: true,
      data: { items: mappedItems, nextCursor },
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
