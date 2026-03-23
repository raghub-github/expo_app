/**
 * GET /api/merchant/stores/[id]
 * PATCH /api/merchant/stores/[id] — update store fields (agent verification edits).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById, updateMerchantStore, getLatestStoreDelistingLog } from "@/lib/db/operations/merchant-stores";
import { logFieldChange } from "@/lib/db/operations/merchant-portal-activity-logs";

export const runtime = "nodejs";

async function getStoreAndAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return { allowed: false as const, status: 401, error: "Not authenticated" };
  }
  const superAdmin = await isSuperAdmin(user.id, user.email);
  const allowed =
    superAdmin ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) {
    return { allowed: false as const, status: 403, error: "Merchant dashboard access required" };
  }
  const systemUser = await getSystemUserByEmail(user.email);
  let areaManagerId: number | null = null;
  if (!superAdmin && systemUser) {
    const am = await getAreaManagerByUserId(systemUser.id);
    if (am) areaManagerId = am.id;
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return { allowed: false as const, status: 404, error: "Store not found" };
  }
  const isAgent = areaManagerId != null;
  const systemUserId = systemUser?.id ?? null;
  return { allowed: true as const, store, areaManagerId, isAgent, systemUserId };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid store id" },
        { status: 400 }
      );
    }
    const access = await getStoreAndAccess(storeId);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }
    const store = access.store;

    const verification =
      _request.nextUrl?.searchParams?.get("verification") === "1";

    const approvalStatus = (store.approval_status as unknown as string) || "";
    const isDelisted = approvalStatus.toUpperCase() === "DELISTED";

    let delistedAt: string | null = null;
    let delistReason: string | null = null;
    let delistedByName: string | null = null;
    let delistedByEmail: string | null = null;
    let delistedByRole: string | null = null;

    if (isDelisted) {
      delistedAt = store.delisted_at ? new Date(store.delisted_at).toISOString() : null;
      delistReason = store.delist_reason ?? null;
      try {
        const lastLog = await getLatestStoreDelistingLog(store.id);
        if (lastLog) {
          delistedByName = lastLog.actor_name ?? null;
          delistedByEmail = lastLog.actor_email ?? null;
          delistedByRole = lastLog.action_by_role ?? null;
          if (!delistedAt && lastLog.created_at) {
            delistedAt = new Date(lastLog.created_at).toISOString();
          }
          if (!delistReason && lastLog.reason_description) {
            delistReason = lastLog.reason_description;
          }
        }
      } catch (logErr) {
        console.error("[GET /api/merchant/stores/[id]] delisting log fetch failed:", logErr);
      }
    }

    if (verification) {
      return NextResponse.json({
        success: true,
        store: {
          id: store.id,
          store_id: store.store_id,
          name: store.store_display_name || store.store_name,
          store_name: store.store_name,
          store_display_name: store.store_display_name,
          store_description: store.store_description,
          store_email: store.store_email ?? null,
          store_phones: store.store_phones ?? null,
          full_address: store.full_address ?? null,
          landmark: store.landmark ?? null,
          city: store.city ?? null,
          state: store.state ?? null,
          postal_code: store.postal_code ?? null,
          country: store.country ?? null,
          latitude: store.latitude ?? null,
          longitude: store.longitude ?? null,
          logo_url: null,          banner_url: store.banner_url ?? null,
          gallery_images: store.gallery_images ?? null,
          cuisine_types: store.cuisine_types ?? null,
          food_categories: null,
          avg_preparation_time_minutes: store.avg_preparation_time_minutes ?? null,
          min_order_amount: store.min_order_amount ?? null,
          delivery_radius_km: store.delivery_radius_km ?? null,
          is_pure_veg: store.is_pure_veg ?? null,
          accepts_online_payment: store.accepts_online_payment ?? null,
          accepts_cash: store.accepts_cash ?? null,
          store_type: store.store_type ?? null,
          approval_status: store.approval_status,
          current_onboarding_step: store.current_onboarding_step ?? null,
          onboarding_completed: store.onboarding_completed ?? false,
          created_at: store.created_at ? new Date(store.created_at).toISOString() : null,
          updated_at: store.updated_at ? new Date(store.updated_at).toISOString() : null,
          delisted_at: delistedAt,
          delist_reason: delistReason,
          delisted_by_name: delistedByName,
          delisted_by_email: delistedByEmail,
          delisted_by_role: delistedByRole,
        },
      });
    }

    return NextResponse.json({
      success: true,
      store: {
        id: store.id,
        store_id: store.store_id,
        name: store.store_display_name || store.store_name,
        city: store.city ?? null,
        full_address: store.full_address ?? null,
        approval_status: store.approval_status,
        current_onboarding_step: store.current_onboarding_step ?? null,
        onboarding_completed: store.onboarding_completed ?? false,
        store_email: store.store_email ?? null,
        created_at: store.created_at ? new Date(store.created_at).toISOString() : null,
        delisted_at: delistedAt,
        delist_reason: delistReason,
        delisted_by_name: delistedByName,
        delisted_by_email: delistedByEmail,
        delisted_by_role: delistedByRole,
      },
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}

const PATCH_STRING_KEYS = [
  "store_name", "store_display_name", "store_description", "store_email",
  "full_address", "landmark", "city", "state", "postal_code", "country", "store_type",
  "banner_url",
] as const;
const PATCH_NUMBER_KEYS = [
  "latitude", "longitude", "avg_preparation_time_minutes", "min_order_amount", "delivery_radius_km",
] as const;
const PATCH_BOOLEAN_KEYS = ["is_pure_veg", "accepts_online_payment", "accepts_cash"] as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid store id" },
        { status: 400 }
      );
    }
    const access = await getStoreAndAccess(storeId);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }
    const body = await request.json().catch(() => ({}));
    const changeReason = typeof body.change_reason === "string" ? body.change_reason : null;
    const data: Record<string, unknown> = {};

    const existingPhones = Array.isArray(access.store.store_phones) ? access.store.store_phones : [];
    const primaryPhone = existingPhones[0] ?? null;
    const isAgent = access.isAgent;

    if (isAgent) {
      // Agents may edit ONLY the alternate store phone. Primary is read-only.
      let alternatePhone: string | undefined;
      if (body.alternate_phone !== undefined) {
        alternatePhone = typeof body.alternate_phone === "string" ? body.alternate_phone.trim() : "";
      } else if (Array.isArray(body.store_phones)) {
        const second = body.store_phones[1];
        alternatePhone = second != null ? String(second).trim() : "";
      }
      if (alternatePhone !== undefined) {
        const nextPhones = alternatePhone ? [primaryPhone, alternatePhone].filter(Boolean) : (primaryPhone ? [primaryPhone] : []);
        data.store_phones = nextPhones;
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json(
          { success: true, store: { id: access.store.id, store_id: access.store.store_id } }
        );
      }
    } else {
      // Super admin: allow all fields
      for (const key of PATCH_STRING_KEYS) {
        if (body[key] !== undefined) {
          const v = body[key];
          data[key] = typeof v === "string" ? v : v == null ? null : String(v);
        }
      }
      for (const key of PATCH_NUMBER_KEYS) {
        if (body[key] !== undefined) {
          const v = body[key];
          if (v === null || v === "") {
            data[key] = null;
          } else {
            const n = Number(v);
            data[key] = Number.isFinite(n) ? n : undefined;
          }
        }
      }
      for (const key of PATCH_BOOLEAN_KEYS) {
        if (body[key] !== undefined) {
          data[key] = Boolean(body[key]);
        }
      }
      if (body.store_phones !== undefined) {
        const v = body.store_phones;
        data.store_phones = Array.isArray(v)
          ? v.map((x: unknown) => (x != null ? String(x) : "")).filter(Boolean)
          : typeof v === "string"
          ? v.split(/[\s,]+/).filter(Boolean)
          : undefined;
      }
      if (body.cuisine_types !== undefined) {
        const v = body.cuisine_types;
        const arr = Array.isArray(v) ? v : (typeof v === "string" ? v.split(/[\s,]+/) : []);
        data.cuisine_types = arr.map((x: unknown) => String(x)).filter(Boolean);
      }
      if (body.gallery_images !== undefined) {
        const v = body.gallery_images;
        data.gallery_images = Array.isArray(v) ? v.map((x: unknown) => String(x)).filter(Boolean) : undefined;
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json(
          { success: true, store: { id: access.store.id, store_id: access.store.store_id } }
        );
      }
    }

    const updated = await updateMerchantStore(storeId, access.areaManagerId, data as Parameters<typeof updateMerchantStore>[2]);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Update failed" },
        { status: 500 }
      );
    }

    // Audit: log every changed field (backend, mandatory). Prefer system user id (who made the change), fallback to area manager id.
    const agentId = access.systemUserId ?? access.areaManagerId ?? null;
    const section = "profile";
    try {
      for (const key of Object.keys(data)) {
        const oldVal = (access.store as unknown as Record<string, unknown>)[key];
        const newVal = (updated as unknown as Record<string, unknown>)[key];
        await logFieldChange(
          storeId,
          agentId,
          section,
          key,
          oldVal,
          newVal,
          changeReason,
          "update"
        );
      }
    } catch (logErr) {
      console.error("[PATCH /api/merchant/stores/[id]] activity log failed:", logErr);
    }

    return NextResponse.json({
      success: true,
      store: {
        id: updated.id,
        store_id: updated.store_id,
        store_name: updated.store_name,
        store_display_name: updated.store_display_name,
        store_email: updated.store_email,
        store_phones: updated.store_phones ?? null,
        city: updated.city,
      },
    });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
