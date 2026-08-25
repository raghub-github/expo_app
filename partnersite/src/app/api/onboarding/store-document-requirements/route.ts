import { NextRequest, NextResponse } from "next/server";
import { client as sql } from "@/lib/drizzle";
import { defaultCuisineListEnabled, normalizeStoreTypeCode } from "@/lib/onboarding-store-types";
import { coerceFormSection, type MerchantDocRequirement } from "@/lib/merchant-onboarding-docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function asBool(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "t" || s === "true" || s === "yes" || s === "1";
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

function normalizeMappedDocs(
  rows: {
    code: string;
    label: string;
    hint: string | null;
    formSection: string | null;
    isMandatory: unknown;
    displayOrder: number;
  }[]
): MerchantDocRequirement[] {
  const seen = new Set<string>();
  const out: MerchantDocRequirement[] = [];
  for (const row of rows) {
    const code = String(row.code || "").trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      label: String(row.label || code).trim() || code,
      hint: row.hint ?? null,
      formSection: coerceFormSection(row.formSection, code),
      isMandatory: asBool(row.isMandatory),
      displayOrder: Number(row.displayOrder) || 0,
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const storeType = normalizeStoreTypeCode(req.nextUrl.searchParams.get("storeType") || "");
  if (!storeType) {
    return json({ success: false, error: "storeType is required" }, 400);
  }
  try {
    // Map is source of truth (same as Super Admin). Catalog only supplies label/section.
    // Do not filter catalog.is_active — that dropped TRADE_LICENSE / SHOP_ACT on grocery.
    const rows = await sql<
      {
        code: string;
        label: string;
        hint: string | null;
        formSection: string | null;
        isMandatory: unknown;
        displayOrder: number;
      }[]
    >`
      SELECT
        UPPER(REPLACE(REPLACE(BTRIM(COALESCE(c.code, m.document_code)), ' ', '_'), '-', '_')) AS code,
        COALESCE(c.label, m.document_code) AS label,
        c.hint,
        c.form_section AS "formSection",
        m.is_mandatory AS "isMandatory",
        m.display_order AS "displayOrder"
      FROM merchant_store_type_document_map m
      LEFT JOIN merchant_onboarding_document_types c
        ON UPPER(REPLACE(REPLACE(BTRIM(c.code), ' ', '_'), '-', '_'))
         = UPPER(REPLACE(REPLACE(BTRIM(m.document_code), ' ', '_'), '-', '_'))
      WHERE (
          UPPER(REPLACE(REPLACE(BTRIM(m.store_type), ' ', '_'), '-', '_')) = ${storeType}
          OR UPPER(BTRIM(m.store_type)) = ${storeType}
        )
        AND m.is_active = true
      ORDER BY m.display_order ASC, c.sort_order ASC NULLS LAST, m.id ASC
    `;
    let docs = normalizeMappedDocs(rows);

    let mappedForType = docs.length > 0;
    if (!mappedForType) {
      try {
        const mapped = await sql<{ ok: number }[]>`
          SELECT 1 AS ok
          FROM merchant_store_type_document_map m
          WHERE UPPER(REPLACE(REPLACE(BTRIM(m.store_type), ' ', '_'), '-', '_')) = ${storeType}
             OR UPPER(BTRIM(m.store_type)) = ${storeType}
          LIMIT 1
        `;
        mappedForType = mapped.length > 0;
      } catch {
        mappedForType = false;
      }
    }

    // Super Admin already configured this type (possibly all inactive) — do not dump legacy extras.
    if (docs.length === 0 && !mappedForType) {
      try {
        const legacy = await sql<
          {
            code: string;
            label: string;
            hint: string | null;
            formSection: string | null;
            isMandatory: unknown;
            displayOrder: number;
          }[]
        >`
          SELECT
            UPPER(BTRIM(d.document_type::text)) AS code,
            COALESCE(NULLIF(BTRIM(MAX(d.display_name)), ''), UPPER(BTRIM(d.document_type::text))) AS label,
            MAX(d.description) AS hint,
            NULL AS "formSection",
            bool_or(d.is_mandatory) AS "isMandatory",
            COALESCE(MIN(d.display_order), 0) AS "displayOrder"
          FROM store_type_document_requirements d
          WHERE UPPER(REPLACE(REPLACE(BTRIM(d.store_type::text), ' ', '_'), '-', '_')) = ${storeType}
             OR UPPER(BTRIM(d.store_type::text)) = ${storeType}
          GROUP BY UPPER(BTRIM(d.document_type::text))
          ORDER BY COALESCE(MIN(d.display_order), 0) ASC
        `;
        docs = normalizeMappedDocs(legacy);
      } catch {
        /* legacy table may not exist */
      }
    }

    let cuisineListEnabled = defaultCuisineListEnabled(storeType);
    try {
      const flags = await sql<{ cuisineListEnabled: unknown }[]>`
        SELECT cuisine_list_enabled AS "cuisineListEnabled"
        FROM merchant_store_type_onboarding_flags
        WHERE UPPER(REPLACE(REPLACE(BTRIM(store_type), ' ', '_'), '-', '_')) = ${storeType}
        LIMIT 1
      `;
      if (flags[0]) cuisineListEnabled = asBool(flags[0].cuisineListEnabled);
    } catch {
      /* flag table may not exist yet */
    }
    return json({ success: true, storeType, docs, cuisineListEnabled });
  } catch (e) {
    console.warn("[store-document-requirements] error:", e);
    return json({
      success: false,
      storeType,
      docs: null,
      cuisineListEnabled: defaultCuisineListEnabled(storeType),
    }, 500);
  }
}
