/**
 * GET /api/area-manager/stores/[id] - Get one store
 * PATCH /api/area-manager/stores/[id] - Update store (verify/reject/soft delete)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getMerchantStoreById, getChildMerchantStores, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { logAreaManagerActivity } from "@/lib/area-manager/activity";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (isNaN(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const { resolved } = authResult;
    const areaManagerId = resolved.isSuperAdmin ? null : resolved.areaManager.id;
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const children = await getChildMerchantStores(store.parent_id, areaManagerId);
    const mapStore = (s: typeof store) => ({
      id: s.id,
      storeId: s.store_id,
      name: s.store_display_name ?? s.store_name,
      storeName: s.store_name,
      storeDisplayName: s.store_display_name,
      storeDescription: s.store_description,
      storeEmail: s.store_email,
      storePhones: s.store_phones,
      fullAddress: s.full_address,
      landmark: s.landmark,
      city: s.city,
      state: s.state,
      postalCode: s.postal_code,
      country: s.country,
      latitude: s.latitude,
      longitude: s.longitude,
      logoUrl: null,      bannerUrl: s.banner_url,
      galleryImages: s.gallery_images,
      cuisineTypes: s.cuisine_types,
      foodCategories: null,
      avgPreparationTimeMinutes: s.avg_preparation_time_minutes,
      minOrderAmount: s.min_order_amount,
      deliveryRadiusKm: s.delivery_radius_km,
      isPureVeg: s.is_pure_veg,
      acceptsOnlinePayment: s.accepts_online_payment,
      acceptsCash: s.accepts_cash,
      ownerPhone: s.store_phones?.[0] ?? "",
      status: s.approval_status === "APPROVED" ? "VERIFIED" : s.approval_status === "REJECTED" ? "REJECTED" : "PENDING",
      approvalStatus: s.approval_status,
      approvalReason: s.approval_reason,
      approvedBy: s.approved_by,
      approvedAt: s.approved_at,
      rejectedReason: s.rejected_reason,
      currentOnboardingStep: s.current_onboarding_step,
      onboardingCompleted: s.onboarding_completed,
      onboardingCompletedAt: s.onboarding_completed_at,
      isActive: s.is_active,
      isAcceptingOrders: s.is_accepting_orders,
      isAvailable: s.is_available,
      lastActivityAt: s.last_activity_at,
      storeType: s.store_type,
      operationalStatus: s.operational_status,
      localityCode: null,
      areaCode: null,
      parentStoreId: s.parent_id,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      createdBy: s.created_by,
      updatedBy: s.updated_by,
      parent: "parent" in s ? s.parent : undefined,
    });
    const childStores = children.map((c) => mapStore(c));
    const data: Record<string, unknown> = { ...mapStore(store), childStores };
    if ("parent" in store && store.parent) data.parent = store.parent;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[GET /api/area-manager/stores/[id]]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (isNaN(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const body = await request.json();
    const {
      name,
      status,
      deletedAt,
      storeDescription,
      storeEmail,
      storePhones,
      fullAddress,
      landmark,
      city,
      state,
      postalCode,
      latitude,
      longitude,
      avgPreparationTimeMinutes,
      minOrderAmount,
      deliveryRadiusKm,
      isPureVeg,
      acceptsOnlinePayment,
      acceptsCash,
      isActive,
      isAcceptingOrders,
      isAvailable,
    } = body;

    const { resolved } = authResult;
    const areaManagerId = resolved.isSuperAdmin ? null : resolved.areaManager.id;

    const updateData: {
      approval_status?: "APPROVED" | "REJECTED";
      store_display_name?: string;
      store_description?: string | null;
      store_email?: string | null;
      store_phones?: string[] | null;
      full_address?: string | null;
      landmark?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      avg_preparation_time_minutes?: number | null;
      min_order_amount?: number | null;
      delivery_radius_km?: number | null;
      is_pure_veg?: boolean | null;
      accepts_online_payment?: boolean | null;
      accepts_cash?: boolean | null;
      is_active?: boolean | null;
      is_accepting_orders?: boolean | null;
      is_available?: boolean | null;
      deleted_at?: Date | null;
    } = {};
    
    if (status === "VERIFIED" || status === "REJECTED") updateData.approval_status = status === "VERIFIED" ? "APPROVED" : "REJECTED";
    if (name !== undefined) updateData.store_display_name = String(name).trim();
    if (storeDescription !== undefined) updateData.store_description = storeDescription ? String(storeDescription).trim() : null;
    if (storeEmail !== undefined) updateData.store_email = storeEmail ? String(storeEmail).trim() : null;
    if (storePhones !== undefined) updateData.store_phones = Array.isArray(storePhones) ? storePhones : storePhones ? [String(storePhones)] : null;
    if (fullAddress !== undefined) updateData.full_address = fullAddress ? String(fullAddress).trim() : null;
    if (landmark !== undefined) updateData.landmark = landmark ? String(landmark).trim() : null;
    if (city !== undefined) updateData.city = city ? String(city).trim() : null;
    if (state !== undefined) updateData.state = state ? String(state).trim() : null;
    if (postalCode !== undefined) updateData.postal_code = postalCode ? String(postalCode).trim() : null;
    if (latitude !== undefined) updateData.latitude = latitude != null ? parseFloat(String(latitude)) : null;
    if (longitude !== undefined) updateData.longitude = longitude != null ? parseFloat(String(longitude)) : null;
    if (avgPreparationTimeMinutes !== undefined) updateData.avg_preparation_time_minutes = avgPreparationTimeMinutes != null ? parseInt(String(avgPreparationTimeMinutes)) : null;
    if (minOrderAmount !== undefined) updateData.min_order_amount = minOrderAmount != null ? parseFloat(String(minOrderAmount)) : null;
    if (deliveryRadiusKm !== undefined) updateData.delivery_radius_km = deliveryRadiusKm != null ? parseFloat(String(deliveryRadiusKm)) : null;
    if (isPureVeg !== undefined) updateData.is_pure_veg = Boolean(isPureVeg);
    if (acceptsOnlinePayment !== undefined) updateData.accepts_online_payment = Boolean(acceptsOnlinePayment);
    if (acceptsCash !== undefined) updateData.accepts_cash = Boolean(acceptsCash);
    if (isActive !== undefined) updateData.is_active = Boolean(isActive);
    if (isAcceptingOrders !== undefined) updateData.is_accepting_orders = Boolean(isAcceptingOrders);
    if (isAvailable !== undefined) updateData.is_available = Boolean(isAvailable);
    if (deletedAt !== undefined) updateData.deleted_at = deletedAt ? new Date() : null;

    const updated = await updateMerchantStore(storeId, areaManagerId, updateData);
    if (!updated) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const action =
      status === "VERIFIED"
        ? "STORE_VERIFIED"
        : status === "REJECTED"
          ? "STORE_REJECTED"
          : "STORE_UPDATED";
    await logAreaManagerActivity({
      actorId: resolved.systemUserId,
      action,
      entityType: "store",
      entityId: storeId,
    });

    const mapped = {
      id: updated.id,
      storeId: updated.store_id,
      name: updated.store_display_name ?? updated.store_name,
      status: updated.approval_status === "APPROVED" ? "VERIFIED" : updated.approval_status === "REJECTED" ? "REJECTED" : "PENDING",
      parentStoreId: updated.parent_id,
      createdAt: updated.created_at,
    };
    return NextResponse.json({ success: true, data: mapped });
  } catch (error) {
    console.error("[PATCH /api/area-manager/stores/[id]]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
