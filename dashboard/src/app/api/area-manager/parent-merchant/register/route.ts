/**
 * POST /api/area-manager/parent-merchant/register
 * Register a new parent merchant (merchant_parents) - same logic as partnersite register parent.
 * Accepts JSON or FormData (with optional store_logo file). Logo uploaded to R2 under
 * docs/merchants/{parent_merchant_id}/logo/ and stored as proxy URL in DB.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getSql } from "@/lib/db/client";
import { parentMerchantSchema } from "@/lib/merchant/validation/parentMerchantSchema";
import { logAreaManagerActivity } from "@/lib/area-manager/activity";
import { apiErrorResponse } from "@/lib/api-errors";
import { uploadWithKey } from "@/lib/services/r2";
import { getParentLogoKey, toStoredDocumentUrl } from "@/lib/r2-parent-logo";

export const runtime = "nodejs";

function formDataToBody(formData: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (k === "store_logo" && v instanceof File) continue;
    body[k] = typeof v === "string" ? v : (v instanceof File ? null : String(v));
  }
  return body;
}

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

    const contentType = req.headers.get("content-type") ?? "";
    let body: Record<string, unknown>;
    let storeLogoFile: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      body = formDataToBody(formData);
      const file = formData.get("store_logo");
      if (file instanceof File && file.size > 0) storeLogoFile = file;
    } else {
      body = (await req.json()) as Record<string, unknown>;
    }

    const parse = parentMerchantSchema.safeParse(body);
    if (!parse.success) {
      const msg = parse.error.issues[0]?.message ?? "Validation failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const data = parse.data;

    // Normalize phone: ensure 10-15 digits (allow leading +)
    const rawPhone = String(data.registered_phone).replace(/\D/g, "");
    const registered_phone = rawPhone.length >= 10 ? `+91${rawPhone.slice(-10)}` : data.registered_phone;
    const registered_phone_normalized = rawPhone.slice(-10) || null;

    const sql = getSql();

    // Check duplicate phone
    const phoneExists = await sql`
      SELECT parent_merchant_id FROM merchant_parents WHERE registered_phone = ${registered_phone}
    `;
    if (phoneExists.length > 0) {
      return NextResponse.json(
        { error: "Merchant already registered with this mobile number.", parent_merchant_id: (phoneExists[0] as { parent_merchant_id: string }).parent_merchant_id },
        { status: 409 }
      );
    }

    // Check duplicate email if provided
    if (data.owner_email?.trim()) {
      const emailExists = await sql`
        SELECT parent_merchant_id FROM merchant_parents WHERE owner_email = ${data.owner_email.trim()}
      `;
      if (emailExists.length > 0) {
        return NextResponse.json(
          { error: "Email already registered." },
          { status: 409 }
        );
      }
    }

    // Generate parent_merchant_id (GMMP1001, GMMP1002, ...)
    const last = await sql`
      SELECT parent_merchant_id FROM merchant_parents WHERE parent_merchant_id ~ '^GMMP\\d+$' ORDER BY parent_merchant_id DESC LIMIT 1
    `;
    let nextNum = 1001;
    if (last.length > 0) {
      const lastId = (last[0] as { parent_merchant_id: string }).parent_merchant_id;
      const match = lastId.match(/^GMMP(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const parent_merchant_id = `GMMP${nextNum}`;

    const alternatePhoneVal = data.alternate_phone?.replace(/\D/g, "");
    const alternate_phone = alternatePhoneVal && alternatePhoneVal.length >= 10 ? `+91${alternatePhoneVal.slice(-10)}` : null;

    // Resolve area manager name for created_by_name (and area_manager_id when available)
    const systemUserRows = await sql`
      SELECT full_name FROM system_users WHERE id = ${authResult.resolved.systemUserId} LIMIT 1
    `;
    const created_by_name = systemUserRows.length > 0 ? (systemUserRows[0] as { full_name: string }).full_name : null;
    const area_manager_id = authResult.resolved.areaManager?.id > 0 ? authResult.resolved.areaManager.id : null;

    // Parent logo: upload file to R2 (same as partnersite) or use provided URL
    let store_logo_value: string | null = (data.store_logo as string)?.trim() || null;
    if (storeLogoFile) {
      const ext = (storeLogoFile.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
      const baseName = storeLogoFile.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80) || "logo";
      const fileName = `${Date.now()}_${baseName}.${ext}`;
      const r2Key = getParentLogoKey(parent_merchant_id, fileName);
      await uploadWithKey(storeLogoFile, r2Key);
      store_logo_value = toStoredDocumentUrl(r2Key);
    }

    const supabase_user_id = typeof data.supabase_user_id === "string" && /^[0-9a-f-]{36}$/i.test(data.supabase_user_id.trim())
      ? data.supabase_user_id.trim()
      : null;

    const inserted = await sql`
      INSERT INTO merchant_parents (
        parent_merchant_id, parent_name, merchant_type, owner_name, owner_email,
        registered_phone, registered_phone_normalized, alternate_phone, brand_name, business_category,
        is_active, registration_status, approval_status, address_line1, city, state, pincode,
        store_logo, created_by_name, supabase_user_id
      ) VALUES (
        ${parent_merchant_id},
        ${data.parent_name},
        ${data.merchant_type ?? "LOCAL"},
        ${data.owner_name},
        ${data.owner_email?.trim() || null},
        ${registered_phone},
        ${registered_phone_normalized},
        ${alternate_phone},
        ${data.brand_name?.trim() || null},
        ${data.business_category?.trim() || null},
        ${typeof data.is_active === "boolean" ? data.is_active : true},
        ${(data.registration_status as string) ?? "VERIFIED"},
        'APPROVED',
        ${data.address_line1?.trim() || null},
        ${data.city?.trim() || null},
        ${data.state?.trim() || null},
        ${data.pincode?.trim() || null},
        ${store_logo_value},
        ${created_by_name},
        ${supabase_user_id}
      )
      RETURNING id
    `;
    const parentId = (inserted[0] as { id: number })?.id ?? 0;

    // Store the registering area manager in parent_area_managers so they see the parent in their stores list
    if (parentId > 0 && area_manager_id != null) {
      await sql`
        INSERT INTO parent_area_managers (parent_id, area_manager_id, assigned_by)
        VALUES (${parentId}, ${area_manager_id}, ${authResult.resolved.systemUserId})
        ON CONFLICT (parent_id, area_manager_id) DO NOTHING
      `;
    }

    await logAreaManagerActivity({
      actorId: authResult.resolved.systemUserId,
      action: "PARENT_REGISTERED",
      entityType: "parent",
      entityId: parentId,
    });

    return NextResponse.json({
      success: true,
      parent_merchant_id,
      info: "Parent merchant registered successfully.",
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "23505") {
      return NextResponse.json({ error: "Duplicate entry for phone or email." }, { status: 409 });
    }
    console.error("[POST /api/area-manager/parent-merchant/register]", e);
    const { body, status } = apiErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
