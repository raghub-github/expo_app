/**
 * GET /api/super-admin/notifications/announcement-stores?service=food&q=...
 * Search stores for CUSTOMER_ANNOUNCEMENT store targeting (filtered by service vertical).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";
import { getCustomerHomeService } from "@/lib/notifications/customer-home-services";
import { resolveStorePublicIdInput } from "@/lib/merchants/normalize-store-search";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const serviceId = (req.nextUrl.searchParams.get("service") || "").trim();
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const service = getCustomerHomeService(serviceId);
  if (!service?.supportsStore || !service.storeTypesForStores?.length) {
    return NextResponse.json(
      { success: false, error: "Service does not support store targeting" },
      { status: 400 },
    );
  }

  const sql = getSql();
  const types = service.storeTypesForStores.map((t) => t.toUpperCase());
  const like = q ? `%${q.replace(/[%_]/g, "")}%` : "%";
  const publicId = q ? resolveStorePublicIdInput(q) : "";
  const hasQuery = q.length > 0;

  try {
    const rows = await sql<
      Array<{
        id: number;
        store_id: string;
        store_name: string;
        store_display_name: string | null;
        store_type: string | null;
        city: string | null;
      }>
    >`
      SELECT id, store_id, store_name, store_display_name, store_type::text AS store_type, city
      FROM merchant_stores
      WHERE deleted_at IS NULL
        AND UPPER(TRIM(COALESCE(store_type::text, ''))) IN ${sql(types)}
        AND (
          ${!hasQuery}
          OR UPPER(TRIM(store_id)) = UPPER(${publicId})
          OR store_name ILIKE ${like}
          OR COALESCE(store_display_name, '') ILIKE ${like}
          OR store_id ILIKE ${like}
          OR id::text = ${q || "0"}
        )
      ORDER BY id DESC
      LIMIT 25
    `;

    return NextResponse.json({
      success: true,
      items: (Array.isArray(rows) ? rows : []).map((r) => ({
        id: Number(r.id),
        storeId: String(r.store_id),
        name:
          (r.store_display_name && String(r.store_display_name).trim()) ||
          (r.store_name && String(r.store_name).trim()) ||
          String(r.store_id),
        storeType: r.store_type ? String(r.store_type) : null,
        city: r.city ? String(r.city) : null,
      })),
    });
  } catch (e) {
    console.error("[GET announcement-stores]", e);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}
