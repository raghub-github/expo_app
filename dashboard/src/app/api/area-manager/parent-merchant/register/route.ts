/**
 * POST /api/area-manager/parent-merchant/register
 * Register a new parent merchant (merchant_parents) - same logic as partnersite register parent.
 * Accepts JSON or FormData (with optional store_logo file). Logo uploaded to R2 under
 * docs/merchants/{parent_merchant_id}/logo/ and stored as proxy URL in DB.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getSql } from "@/lib/db/client";
import { parentMerchantSchema } from "@/lib/merchant/validation/parentMerchantSchema";
import { logAreaManagerActivity } from "@/lib/area-manager/activity";
import { apiErrorResponse } from "@/lib/api-errors";
import { uploadWithKey } from "@/lib/services/r2";
import { getParentLogoKey, toStoredDocumentUrl } from "@/lib/r2-parent-logo";
import { applyMerchantReferralOnParentCreate } from "@/lib/merchant/applyMerchantReferralOnParent";
import { getAuthUserSafe } from "@/lib/auth/resolve-supabase-user";
import { normalizeEmail } from "@/lib/valid-email";

export const runtime = "nodejs";

type Sql = ReturnType<typeof getSql>;

function formDataToBody(formData: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (k === "store_logo" && v instanceof File) continue;
    body[k] = typeof v === "string" ? v : (v instanceof File ? null : String(v));
  }
  return body;
}

function pgField(e: unknown, key: string): string {
  if (!e || typeof e !== "object") return "";
  const rec = e as Record<string, unknown>;
  const val = rec[key];
  return typeof val === "string" ? val : "";
}

function isUniqueViolation(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const rec = e as { code?: unknown; message?: unknown; cause?: unknown };
  if (rec.code === "23505") return true;
  if (typeof rec.message === "string" && /duplicate key value/i.test(rec.message)) return true;
  if (rec.cause) return isUniqueViolation(rec.cause);
  return false;
}

function uniqueConstraintName(e: unknown): string {
  return (
    pgField(e, "constraint_name") ||
    pgField(e, "constraint") ||
    ""
  ).toLowerCase();
}

function uniqueDetail(e: unknown): string {
  return `${pgField(e, "detail")} ${pgField(e, "message")}`.toLowerCase();
}

function uniqueViolationResponse(e: unknown): NextResponse {
  const name = uniqueConstraintName(e);
  const detail = uniqueDetail(e);
  console.error("[POST /api/area-manager/parent-merchant/register] unique violation", {
    constraint: name || pgField(e, "constraint_name") || pgField(e, "constraint"),
    detail: pgField(e, "detail"),
    table: pgField(e, "table_name") || pgField(e, "table"),
  });
  if (name.includes("supabase_user_id") || detail.includes("supabase_user_id")) {
    return NextResponse.json(
      {
        error:
          "This partner email login is already linked to another parent. Use a different partner email.",
      },
      { status: 409 }
    );
  }
  if (name.includes("registered_phone") || detail.includes("registered_phone")) {
    return NextResponse.json(
      { error: "Merchant already registered with this mobile number." },
      { status: 409 }
    );
  }
  if (name.includes("email") || detail.includes("owner_email")) {
    return NextResponse.json({ error: "Email already registered." }, { status: 409 });
  }
  if (name.includes("parent_merchant_id") || detail.includes("parent_merchant_id")) {
    return NextResponse.json(
      { error: "Could not allocate a parent ID. Please try again." },
      { status: 409 }
    );
  }
  return NextResponse.json(
    { error: "This parent could not be saved because a unique field already exists." },
    { status: 409 }
  );
}

async function nextParentMerchantId(sql: Sql): Promise<string> {
  const last = await sql`
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(parent_merchant_id FROM 5) AS INTEGER)),
      1000
    ) AS last_num
    FROM merchant_parents
    WHERE parent_merchant_id ~ '^GMMP[0-9]+$'
  `;
  const lastNum = Number((last[0] as { last_num?: number | string } | undefined)?.last_num ?? 1000);
  const nextNum = Number.isFinite(lastNum) ? lastNum + 1 : 1001;
  return `GMMP${nextNum}`;
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth();
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;
    const fallback = await getAuthUserSafe();
    const amAuthUserId = fallback?.id ?? null;
    const amAuthEmail = fallback?.email ? normalizeEmail(fallback.email) : null;

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

    const rawPhone = String(data.registered_phone).replace(/\D/g, "");
    const phoneDigits = rawPhone.slice(-10);
    if (phoneDigits.length !== 10) {
      return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
    }
    const registered_phone = `+91${phoneDigits}`;
    const registered_phone_normalized = phoneDigits;

    let ownerEmail = data.owner_email?.trim() ? normalizeEmail(data.owner_email) : null;

    const sql = getSql();

    const phoneExists = await sql`
      SELECT parent_merchant_id FROM merchant_parents
      WHERE registered_phone_normalized = ${phoneDigits}
         OR registered_phone IN (
           ${registered_phone},
           ${"91" + phoneDigits},
           ${phoneDigits}
         )
         OR RIGHT(REGEXP_REPLACE(COALESCE(registered_phone, ''), '[^0-9]', '', 'g'), 10) = ${phoneDigits}
      LIMIT 1
    `;
    if (phoneExists.length > 0) {
      return NextResponse.json(
        {
          error: "Merchant already registered with this mobile number.",
          parent_merchant_id: (phoneExists[0] as { parent_merchant_id: string }).parent_merchant_id,
        },
        { status: 409 }
      );
    }

    // AM dashboard creates a *new* parent. Do not block on the AM's own email
    // (already GMMP1010 for this user) or a reused OTP login — those unique
    // keys are not the new store's phone. Drop the conflicting identity fields
    // and still insert.
    if (ownerEmail && amAuthEmail && ownerEmail === amAuthEmail) {
      console.warn(
        "[POST /api/area-manager/parent-merchant/register] owner_email is the AM login; saving parent without it"
      );
      ownerEmail = null;
    }
    if (ownerEmail) {
      const emailExists = await sql`
        SELECT parent_merchant_id FROM merchant_parents
        WHERE LOWER(TRIM(owner_email)) = ${ownerEmail}
        LIMIT 1
      `;
      if (emailExists.length > 0) {
        console.warn(
          "[POST /api/area-manager/parent-merchant/register] owner_email already on",
          (emailExists[0] as { parent_merchant_id: string }).parent_merchant_id,
          "- saving parent without it"
        );
        ownerEmail = null;
      }
    }

    let supabase_user_id =
      typeof data.supabase_user_id === "string" && /^[0-9a-f-]{36}$/i.test(data.supabase_user_id.trim())
        ? data.supabase_user_id.trim()
        : null;

    if (supabase_user_id && amAuthUserId && supabase_user_id === amAuthUserId) {
      supabase_user_id = null;
    }

    if (supabase_user_id) {
      const linked = await sql`
        SELECT parent_merchant_id
        FROM merchant_parents
        WHERE supabase_user_id = ${supabase_user_id}
        LIMIT 1
      `;
      if (linked.length > 0) {
        console.warn(
          "[POST /api/area-manager/parent-merchant/register] supabase_user_id already on",
          (linked[0] as { parent_merchant_id: string }).parent_merchant_id,
          "- saving parent without that login"
        );
        supabase_user_id = null;
      }
    }

    const alternatePhoneVal = data.alternate_phone?.replace(/\D/g, "");
    const alternate_phone =
      alternatePhoneVal && alternatePhoneVal.length >= 10
        ? `+91${alternatePhoneVal.slice(-10)}`
        : null;

    const systemUserRows = await sql`
      SELECT full_name FROM system_users WHERE id = ${authResult.resolved.systemUserId} LIMIT 1
    `;
    const created_by_name =
      systemUserRows.length > 0 ? (systemUserRows[0] as { full_name: string }).full_name : null;
    const area_manager_id =
      authResult.resolved.areaManager?.id > 0 ? authResult.resolved.areaManager.id : null;

    const providedLogoUrl: string | null = (data.store_logo as string)?.trim() || null;

    let parent_merchant_id = "";
    let parentId = 0;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      parent_merchant_id = await nextParentMerchantId(sql);
      try {
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
            ${ownerEmail},
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
            ${providedLogoUrl},
            ${created_by_name},
            ${supabase_user_id}
          )
          RETURNING id
        `;
        parentId = (inserted[0] as { id: number })?.id ?? 0;
        break;
      } catch (insertErr) {
        const name = uniqueConstraintName(insertErr);
        const detail = uniqueDetail(insertErr);
        const idClash =
          isUniqueViolation(insertErr) &&
          (name.includes("parent_merchant_id") || detail.includes("parent_merchant_id"));
        const identityClash =
          isUniqueViolation(insertErr) &&
          (name.includes("supabase_user_id") ||
            name.includes("email") ||
            detail.includes("supabase_user_id") ||
            detail.includes("owner_email"));
        if (idClash && attempt < maxAttempts) continue;
        if (identityClash && attempt < maxAttempts) {
          ownerEmail = null;
          supabase_user_id = null;
          continue;
        }
        throw insertErr;
      }
    }

    if (parentId <= 0 || !parent_merchant_id) {
      return NextResponse.json({ error: "Failed to register parent merchant." }, { status: 500 });
    }

    if (storeLogoFile) {
      try {
        const ext =
          (storeLogoFile.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() ||
          "png";
        const baseName =
          storeLogoFile.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80) ||
          "logo";
        const fileName = `${Date.now()}_${baseName}.${ext}`;
        const r2Key = getParentLogoKey(parent_merchant_id, fileName);
        await uploadWithKey(storeLogoFile, r2Key);
        const store_logo_value = toStoredDocumentUrl(r2Key);
        await sql`
          UPDATE merchant_parents
          SET store_logo = ${store_logo_value}
          WHERE id = ${parentId}
        `;
      } catch (logoErr) {
        console.error("[POST /api/area-manager/parent-merchant/register] logo upload failed", logoErr);
      }
    }

    if (area_manager_id != null) {
      try {
        await sql`
          INSERT INTO parent_area_managers (parent_id, area_manager_id, assigned_by)
          VALUES (${parentId}, ${area_manager_id}, ${authResult.resolved.systemUserId})
          ON CONFLICT (parent_id, area_manager_id) WHERE store_id IS NULL DO NOTHING
        `;
      } catch (linkErr) {
        console.error("[POST /api/area-manager/parent-merchant/register] AM link failed", linkErr);
      }
    }

    await logAreaManagerActivity({
      actorId: authResult.resolved.systemUserId,
      action: "PARENT_REGISTERED",
      entityType: "parent",
      entityId: parentId,
    });

    const referralCode =
      typeof body.referralCode === "string"
        ? body.referralCode
        : typeof data.referralCode === "string"
          ? data.referralCode
          : "";
    const referral = await applyMerchantReferralOnParentCreate({
      parentPk: parentId,
      referralCode,
      source: "manual",
      referredPhone: registered_phone,
    });
    if (!referral.ok) {
      console.warn("[POST /api/area-manager/parent-merchant/register] referral code not allocated", referral);
    } else {
      console.log(
        "[POST /api/area-manager/parent-merchant/register] referral code ready",
        parent_merchant_id,
        referral.referralCode ?? "ok"
      );
    }

    return NextResponse.json({
      success: true,
      parent_merchant_id,
      info: "Parent merchant registered successfully.",
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return uniqueViolationResponse(e);
    }
    console.error("[POST /api/area-manager/parent-merchant/register]", e);
    const { body, status } = apiErrorResponse(e);
    return NextResponse.json(body, { status });
  }
}
