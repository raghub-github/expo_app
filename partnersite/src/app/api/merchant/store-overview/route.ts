import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { countPendingNewOrders } from "@/lib/count-pending-new-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getDb() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase env not configured");
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isItemOutOfStock(row: {
  out_of_stock_manual?: boolean | null;
  out_of_stock_until?: string | null;
}): boolean {
  if (row.out_of_stock_manual) return true;
  if (row.out_of_stock_until) {
    const until = new Date(row.out_of_stock_until).getTime();
    return Number.isFinite(until) && until > Date.now();
  }
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get("store_id");
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const db = getDb();
    const storeIdNum = gate.storeIdNum;

    const [itemsRes, catsRes, pendingOrders, storeRes] = await Promise.all([
      db
        .from("merchant_menu_items")
        .select("id, category_id, is_active, approval_status, out_of_stock_manual, out_of_stock_until")
        .eq("store_id", storeIdNum),
      db.from("merchant_menu_categories").select("id, category_name").eq("store_id", storeIdNum),
      countPendingNewOrders(db, storeIdNum).catch((err) => {
        console.error("[store-overview] pending orders:", err);
        return 0;
      }),
      db.from("merchant_stores").select("approval_status").eq("id", storeIdNum).maybeSingle(),
    ]);

    if (itemsRes.error) {
      console.error("[store-overview] items:", itemsRes.error);
      return NextResponse.json({ error: "Failed to load menu" }, { status: 500 });
    }

    const items = itemsRes.data ?? [];
    const activeItems = items.filter((r) => r.is_active !== false);
    const totalProducts = activeItems.length;
    const outOfStock = activeItems.filter((r) => isItemOutOfStock(r)).length;

    const approvedCount = activeItems.filter(
      (r) => String(r.approval_status ?? "").toUpperCase() === "APPROVED",
    ).length;
    const pendingReview = activeItems.filter((r) => {
      const s = String(r.approval_status ?? "").toUpperCase();
      return s === "PENDING" || s === "SUBMITTED" || s === "UNDER_REVIEW";
    }).length;

    const menuApprovalLabel =
      totalProducts === 0
        ? "No items yet"
        : pendingReview > 0
          ? `${approvedCount}/${totalProducts} approved`
          : "All approved";

    const categories = catsRes.data ?? [];
    const countByCat = new Map<number, number>();
    for (const item of activeItems) {
      const cid = Number(item.category_id);
      if (!Number.isFinite(cid)) continue;
      countByCat.set(cid, (countByCat.get(cid) ?? 0) + 1);
    }

    const topCategories = categories
      .map((c) => ({
        name: String(c.category_name ?? "Category"),
        count: countByCat.get(Number(c.id)) ?? 0,
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const maxCount = topCategories[0]?.count ?? 1;
    const topCategoriesWithPct = topCategories.map((c) => ({
      name: c.name,
      count: c.count,
      pct: Math.round((c.count / maxCount) * 100),
    }));

    const storeApproval = String(storeRes.data?.approval_status ?? "").toUpperCase();

    return NextResponse.json({
      total_products: totalProducts,
      out_of_stock: outOfStock,
      pending_orders: pendingOrders,
      menu_approval_label: menuApprovalLabel,
      menu_approval_pct: totalProducts > 0 ? Math.round((approvedCount / totalProducts) * 100) : 0,
      store_approval_status: storeApproval,
      top_categories: topCategoriesWithPct,
    });
  } catch (e) {
    console.error("[store-overview]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
