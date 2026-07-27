/**
 * GET /api/onboarding/check-licence-duplicate
 * ?kind=fssai|drug&number=...&storeInternalId=94 (or storePublicId)
 *
 * Instant uniqueness check for FSSAI / Drug Licence numbers across stores.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

const FSSAI_DUP_MSG =
  "This FSSAI number is already registered with another store. Enter a different FSSAI licence number — duplicates are not allowed.";
const DRUG_DUP_MSG =
  "This Drug Licence number is already registered with another store. Enter a different Drug Licence number — duplicates are not allowed.";

function normalizeFssai(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

function normalizeDrug(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT")) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "AREA_MANAGER"));
    if (!allowed) {
      return NextResponse.json({ error: "Access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const kind = String(searchParams.get("kind") || "")
      .trim()
      .toLowerCase();
    const numberRaw = String(searchParams.get("number") || "").trim();
    const storePublicId = String(
      searchParams.get("storePublicId") || searchParams.get("storeId") || "",
    ).trim();
    const storeInternalIdRaw = String(
      searchParams.get("storeInternalId") || searchParams.get("storeDbId") || "",
    ).trim();

    if (kind !== "fssai" && kind !== "drug") {
      return NextResponse.json(
        { error: "kind must be fssai or drug" },
        { status: 400 },
      );
    }

    if (kind === "fssai") {
      const digits = normalizeFssai(numberRaw);
      if (digits.length !== 14) {
        return NextResponse.json({ duplicate: false, checked: false });
      }
    } else {
      const n = normalizeDrug(numberRaw);
      if (n.length < 5) {
        return NextResponse.json({ duplicate: false, checked: false });
      }
    }

    const sql = getSql();
    let excludeStoreId: number | null = null;
    if (storeInternalIdRaw && /^\d+$/.test(storeInternalIdRaw)) {
      excludeStoreId = Number(storeInternalIdRaw);
    } else if (storePublicId) {
      const rows = (await sql`
        SELECT id FROM merchant_stores
         WHERE store_id = ${storePublicId}
         LIMIT 1
      `) as unknown as Array<{ id: number }>;
      if (rows[0]?.id != null) excludeStoreId = Number(rows[0].id);
    }

    let hit: Array<{ store_id: number }> = [];
    if (kind === "fssai") {
      const digits = normalizeFssai(numberRaw);
      hit = (await sql`
        SELECT d.store_id
          FROM merchant_store_documents d
         WHERE regexp_replace(coalesce(d.fssai_document_number, ''), '[^0-9]', '', 'g') = ${digits}
           AND (${excludeStoreId}::bigint IS NULL OR d.store_id <> ${excludeStoreId})
         LIMIT 1
      `) as unknown as Array<{ store_id: number }>;
    } else {
      const n = normalizeDrug(numberRaw);
      hit = (await sql`
        SELECT d.store_id
          FROM merchant_store_documents d
         WHERE upper(regexp_replace(coalesce(d.drug_license_document_number, ''), '\s+', '', 'g')) = ${n}
           AND (${excludeStoreId}::bigint IS NULL OR d.store_id <> ${excludeStoreId})
         LIMIT 1
      `) as unknown as Array<{ store_id: number }>;
    }

    const duplicate = hit.length > 0;
    return NextResponse.json({
      duplicate,
      checked: true,
      message: duplicate ? (kind === "fssai" ? FSSAI_DUP_MSG : DRUG_DUP_MSG) : null,
    });
  } catch (e) {
    console.error("[check-licence-duplicate]", e);
    return NextResponse.json(
      { error: "Duplicate check failed. Please try again." },
      { status: 500 },
    );
  }
}
