import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";
import { getActiveCommissionForStore } from "@/lib/db/operations/commission";

export const runtime = "nodejs";

function markupPaise(netRupees: number, commissionPercent: number): number {
  if (!Number.isFinite(netRupees) || netRupees <= 0) return 0;
  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent >= 100) {
    return Math.round(netRupees * 100) / 100;
  }
  const exact = (netRupees * 100) / (100 - commissionPercent);
  return Math.round(exact * 100) / 100;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const storeId = parseInt(id, 10);
  if (!Number.isFinite(storeId) || storeId < 1) {
    return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
  }

  const sql = getSql();
  try {
    const rowsPromise = sql<
      Array<{
        id: number;
        item_id: string | null;
        item_name: string;
        selling_price: string;
        in_stock: boolean | null;
      }>
    >`
      SELECT id, item_id, item_name, selling_price::text AS selling_price, in_stock
      FROM merchant_menu_items
      WHERE store_id = ${storeId}
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND COALESCE(is_active, TRUE) = TRUE
        AND COALESCE(is_locked_by_plan, FALSE) = FALSE
      ORDER BY item_name
      LIMIT 500
    `;
    // Cap commission lookup so a slow resolver cannot hang the Flash Sale sheet.
    const commissionPromise = Promise.race([
      getActiveCommissionForStore(storeId).catch(() => ({ percent: 15 })),
      new Promise<{ percent: number }>((resolve) => {
        setTimeout(() => resolve({ percent: 15 }), 2500);
      }),
    ]);
    const [rows, commission] = await Promise.all([rowsPromise, commissionPromise]);
    const pct = Number.isFinite(commission.percent) ? commission.percent : 15;

    const items = (Array.isArray(rows) ? rows : []).map((r) => {
      const ctm = Number(r.selling_price);
      const original = markupPaise(Number.isFinite(ctm) ? ctm : 0, pct);
      return {
        id: Number(r.id),
        itemId: r.item_id,
        name: r.item_name,
        originalCustomerPrice: original,
        inStock: r.in_stock !== false,
      };
    });

    return NextResponse.json({ items, commissionPercent: pct });
  } catch (err) {
    console.error("[GET flash-sale/stores/items]", err);
    return NextResponse.json({ items: [], error: "Menu failed to load" }, { status: 500 });
  }
}
