import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";
import { normalizeStoreSearchToken } from "@/lib/merchants/normalize-store-search";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const exactIdRaw = req.nextUrl.searchParams.get("id");
  const exactPk = exactIdRaw != null && /^\d+$/.test(exactIdRaw) ? Number(exactIdRaw) : 0;
  const sql = getSql();

  try {
    if (exactPk > 0) {
      const rows = await sql<
        Array<{
          id: number;
          store_id: string;
          store_name: string | null;
          store_display_name: string | null;
          city: string | null;
        }>
      >`
        SELECT id, store_id, store_name, store_display_name, city
        FROM merchant_stores
        WHERE deleted_at IS NULL
          AND delisted_at IS NULL
          AND id = ${exactPk}
        LIMIT 1
      `;
      return NextResponse.json({
        stores: (Array.isArray(rows) ? rows : []).map((r) => ({
          id: Number(r.id),
          storeId: String(r.store_id),
          name: String(r.store_display_name || r.store_name || r.store_id),
          city: r.city,
        })),
      });
    }

    const { exactPublicId } = normalizeStoreSearchToken(q);
    const hasQuery = q.length > 0;
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const publicId = exactPublicId ?? "";
    const numericId = /^\d+$/.test(q) ? Number(q) : 0;

    const rows = await sql<
      Array<{
        id: number;
        store_id: string;
        store_name: string | null;
        store_display_name: string | null;
        city: string | null;
      }>
    >`
      SELECT id, store_id, store_name, store_display_name, city
      FROM merchant_stores
      WHERE deleted_at IS NULL
        AND delisted_at IS NULL
        AND (
          ${!hasQuery}
          OR (${publicId !== ""} AND UPPER(TRIM(store_id)) = ${publicId})
          OR store_id ILIKE ${like}
          OR store_name ILIKE ${like}
          OR COALESCE(store_display_name, '') ILIKE ${like}
          OR (${numericId > 0} AND id = ${numericId})
        )
      ORDER BY store_display_name NULLS LAST, store_name
      LIMIT 40
    `;

    return NextResponse.json({
      stores: (Array.isArray(rows) ? rows : []).map((r) => ({
        id: Number(r.id),
        storeId: String(r.store_id),
        name: String(r.store_display_name || r.store_name || r.store_id),
        city: r.city,
      })),
    });
  } catch (err) {
    console.error("[GET flash-sale/stores]", err);
    return NextResponse.json({ stores: [], error: "Store search failed" }, { status: 500 });
  }
}
