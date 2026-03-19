/**
 * POST /api/area-manager/merchant-stores
 * Create a child store (merchant_stores) with step-1 fields (partnersite-style). Used by AM child onboarding form.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { createMerchantStoreChild, getNextChildStoreId, getMerchantStoreByIdOnly, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { upsertChildStoreProgress } from "@/lib/db/operations/child-store-progress";
import { logAreaManagerActivity } from "@/lib/area-manager/activity";
import { apiErrorResponse } from "@/lib/api-errors";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const parentId = body.parentId != null ? Number(body.parentId) : null;
    const storeInternalIdParam = body.storeInternalId != null ? Number(body.storeInternalId) : null;
    const storeName = typeof body.store_name === "string" ? body.store_name.trim() : "";
    const ownerFullName = typeof body.owner_full_name === "string" ? body.owner_full_name.trim() || null : null;
    const storeDisplayName = typeof body.store_display_name === "string" ? body.store_display_name.trim() : null;
    const legalBusinessName = typeof body.legal_business_name === "string" ? body.legal_business_name.trim() : null;
    const storeType = typeof body.store_type === "string" ? body.store_type.trim() || "RESTAURANT" : "RESTAURANT";
    const customStoreType = typeof body.custom_store_type === "string" ? body.custom_store_type.trim() : null;
    const storeEmail = typeof body.store_email === "string" ? body.store_email.trim() : null;
    let storePhones: string[] = [];
    if (Array.isArray(body.store_phones)) {
      storePhones = body.store_phones.filter((p: unknown) => typeof p === "string" && p.trim()).map((p: string) => p.trim());
    } else if (typeof body.store_phones === "string") {
      storePhones = body.store_phones.split(",").map((p: string) => p.trim()).filter(Boolean);
    }
    const storeDescription = typeof body.store_description === "string" ? body.store_description.trim() : null;

    if (!parentId || !Number.isFinite(parentId)) {
      return NextResponse.json({ error: "parentId is required" }, { status: 400 });
    }
    if (!storeName) {
      return NextResponse.json({ error: "Store name is required" }, { status: 400 });
    }

    const areaManagerId = authResult.resolved.isSuperAdmin ? null : (authResult.resolved.areaManager?.id ?? null);
    if (areaManagerId == null && !authResult.resolved.isSuperAdmin) {
      return NextResponse.json({ error: "Area manager context required" }, { status: 400 });
    }

    // Update existing child store when AM is completing registration (storeInternalId from URL).
    if (storeInternalIdParam != null && Number.isFinite(storeInternalIdParam)) {
      const store = await getMerchantStoreByIdOnly(storeInternalIdParam);
      if (!store) {
        return NextResponse.json({ error: "Store not found" }, { status: 404 });
      }
      // Update the existing store; parentId from client is used for progress only (list context can use different id source).
      const updated = await updateMerchantStore(store.id, null, {
        store_name: storeName,
        owner_full_name: ownerFullName ?? null,
        store_display_name: storeDisplayName || null,
        store_description: storeDescription ?? null,
        store_type: storeType || "RESTAURANT",
        custom_store_type: storeType === "OTHERS" ? customStoreType ?? null : null,
        store_email: storeEmail ?? null,
        store_phones: storePhones.length ? storePhones : null,
      });
      if (!updated) {
        return NextResponse.json({ error: "Failed to update store" }, { status: 500 });
      }
      const step1FormData = {
        store_name: storeName,
        owner_full_name: ownerFullName ?? undefined,
        store_display_name: storeDisplayName ?? undefined,
        legal_business_name: legalBusinessName ?? undefined,
        store_type: storeType || "RESTAURANT",
        custom_store_type: storeType === "OTHERS" ? customStoreType ?? undefined : undefined,
        store_email: storeEmail ?? undefined,
        store_phones: storePhones.length ? storePhones : undefined,
        store_description: storeDescription ?? undefined,
      };
      await upsertChildStoreProgress({
        parentId,
        storeInternalId: updated.id,
        currentStep: 2,
        formDataPatch: {
          step_store: { storeDbId: updated.id, storePublicId: updated.store_id },
          step1: step1FormData,
        },
      });
      // Ensure mapping exists in parent_area_managers when AM is associated.
      const sql = getSql();
      const effectiveAmId = updated.area_manager_id ?? areaManagerId;
      if (effectiveAmId != null) {
        await sql`
          INSERT INTO parent_area_managers (parent_id, store_id, area_manager_id, assigned_by)
          VALUES (${parentId}, ${updated.id}, ${effectiveAmId}, ${authResult.resolved.systemUserId ?? null})
          ON CONFLICT (parent_id, store_id, area_manager_id) DO NOTHING
        `;
      }
      await logAreaManagerActivity({
        actorId: authResult.resolved.systemUserId,
        action: "STORE_UPDATED",
        entityType: "store",
        entityId: updated.id,
      });
      return NextResponse.json({
        success: true,
        data: { id: updated.id, store_id: updated.store_id },
      });
    }

    const storeId = await getNextChildStoreId();
    const row = await createMerchantStoreChild({
      parentId,
      storeId,
      storeName,
      ownerFullName: ownerFullName ?? null,
      storeDisplayName: storeDisplayName || null,
      legalBusinessName: legalBusinessName || null,
      storeType: storeType || "RESTAURANT",
      customStoreType: customStoreType || null,
      storeEmail: storeEmail || null,
      storePhones: storePhones.length ? storePhones : null,
      storeDescription: storeDescription || null,
      areaManagerId,
      createdBy: authResult.resolved.systemUserId ?? null,
    });

    if (!row) {
      return NextResponse.json({ error: "Failed to create store" }, { status: 500 });
    }

    const step1FormData = {
      store_name: storeName,
      owner_full_name: ownerFullName ?? undefined,
      store_display_name: storeDisplayName ?? undefined,
      legal_business_name: legalBusinessName ?? undefined,
      store_type: storeType || "RESTAURANT",
      custom_store_type: storeType === "OTHERS" ? customStoreType ?? undefined : undefined,
      store_email: storeEmail ?? undefined,
      store_phones: storePhones.length ? storePhones : undefined,
      store_description: storeDescription ?? undefined,
    };
    await upsertChildStoreProgress({
      parentId,
      storeInternalId: row.id,
      currentStep: 1,
      formDataPatch: {
        step_store: { storeDbId: row.id, storePublicId: row.store_id },
        step1: step1FormData,
      },
    });

    // Also create mapping in parent_area_managers so Assign AM UI stays in sync.
    if (areaManagerId != null) {
      const sql = getSql();
      await sql`
        INSERT INTO parent_area_managers (parent_id, store_id, area_manager_id, assigned_by)
        VALUES (${parentId}, ${row.id}, ${areaManagerId}, ${authResult.resolved.systemUserId ?? null})
        ON CONFLICT (parent_id, store_id, area_manager_id) DO NOTHING
      `;
    }

    await logAreaManagerActivity({
      actorId: authResult.resolved.systemUserId,
      action: "STORE_CREATED",
      entityType: "store",
      entityId: row.id,
    });

    return NextResponse.json({
      success: true,
      data: { id: row.id, store_id: row.store_id },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505") {
      return NextResponse.json({ error: "Store ID already exists. Please try again." }, { status: 409 });
    }
    console.error("[POST /api/area-manager/merchant-stores]", e);
    const { body, status } = apiErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
