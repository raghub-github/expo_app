/**
 * GET/POST /api/merchant/stores/[id]/menu/cuisines
 * List linked + catalog cuisines; POST resolves name to cuisine_master only (no new master rows).
 */
import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import {
  listCuisinesForStoreDashboard,
  listCatalogCuisinesNotLinkedForStore,
  createCustomCuisine,
  getMerchantParentIdForStore,
  CategoryRuleError,
  getLegacyCuisineNamesForStore,
  listLegacyCuisineNamesNotInMaster,
} from "@/lib/db/operations/menu-category-rules";

export const runtime = "nodejs";

function normalizeCuisineRows(
  rows: unknown
): Array<{ id: number; name: string; is_system_defined: boolean }> {
  if (!Array.isArray(rows)) return [];
  const out: Array<{ id: number; name: string; is_system_defined: boolean }> = [];
  for (const raw of rows) {
    if (raw == null || typeof raw !== "object") continue;
    const x = raw as Record<string, unknown>;
    const idRaw = x.id;
    const idNum =
      typeof idRaw === "bigint" ? Number(idRaw) : typeof idRaw === "number" ? idRaw : Number(idRaw);
    if (!Number.isFinite(idNum) || idNum <= 0) continue;
    if (typeof x.name !== "string") continue;
    out.push({
      id: idNum,
      name: x.name,
      is_system_defined: Boolean(x.is_system_defined),
    });
  }
  return out;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const cuisinesRaw = await listCuisinesForStoreDashboard(storeId);
    const catalogRaw = await listCatalogCuisinesNotLinkedForStore(storeId);
    const cuisines = normalizeCuisineRows(cuisinesRaw);
    const catalog = normalizeCuisineRows(catalogRaw);
    const [legacy_profile_cuisine_names, legacy_cuisines_not_in_master] = await Promise.all([
      getLegacyCuisineNamesForStore(storeId),
      listLegacyCuisineNamesNotInMaster(storeId),
    ]);
    return NextResponse.json({
      success: true,
      cuisines,
      catalog,
      legacy_profile_cuisine_names,
      legacy_cuisines_not_in_master,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu/cuisines]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const name = typeof body.name === "string" ? body.name : "";
    const parentId = await getMerchantParentIdForStore(storeId);
    if (parentId == null) {
      return NextResponse.json(
        { success: false, error: "store_parent_not_found", message: "Merchant parent not found for store" },
        { status: 400 }
      );
    }

    try {
      const created = await createCustomCuisine({ parentId, storeIdNum: storeId, name });
      try {
        await logStoreActivity({
          storeId,
          section: "category",
          action: "create",
          entityId: created.id,
          entityName: name.trim(),
          summary: `Agent linked cuisine from master list '${name.trim()}'`,
          actorType: "agent",
          source: "dashboard",
        });
      } catch (_) {}
      return NextResponse.json({ success: true, id: created.id }, { status: 201 });
    } catch (e) {
      if (e instanceof CategoryRuleError) {
        const errBody =
          e.code === "duplicate_category_name"
            ? { error: "duplicate_cuisine_name", message: e.message }
            : { error: e.code, message: e.message };
        return NextResponse.json(errBody, { status: e.httpStatus });
      }
      const msg = String((e as Error)?.message || e);
      if (msg.includes("duplicate") || (e as { code?: string })?.code === "23505") {
        return NextResponse.json(
          { error: "duplicate_cuisine_name", message: "Cuisine name already exists" },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/cuisines]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
