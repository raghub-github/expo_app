import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureMerchantStoreDashboardAccess } from "@/lib/merchant-food-orders/store-access";

/**
 * Best-effort KOT print audit — Control dashboard merchant portal.
 * Same tables as partnersite `/api/food-orders/kot-print`.
 */
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId: orderIdParam } = await params;
    const storeId = parseInt(id, 10);
    const access = await ensureMerchantStoreDashboardAccess(storeId);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = (await req.json().catch(() => ({}))) as {
      order_id?: number;
      store_id?: number | null;
      kot_number?: string | null;
      printed_by?: string;
      print_channel?: string;
    };

    const orderId = Number(body.order_id ?? orderIdParam);
    if (!Number.isFinite(orderId) || orderId < 1) {
      return NextResponse.json({ error: "invalid_order_id" }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    const db = supabaseAdmin;
    const printedBy = (body.printed_by ?? "control_dashboard_merchant").slice(0, 64);
    const printChannel = (body.print_channel ?? "browser").slice(0, 64);

    const { data: tok } = await db
      .from("order_pickup_tokens")
      .select("id, kot_number, kot_print_count, kot_version")
      .eq("order_id", orderId)
      .maybeSingle();

    if (tok?.id) {
      await db
        .from("order_pickup_tokens")
        .update({
          last_kot_printed_at: new Date().toISOString(),
          kot_print_count: Number(tok.kot_print_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tok.id);

      await db.from("order_kot_print_events").insert({
        order_id: orderId,
        store_id: access.store.id,
        token_id: tok.id,
        kot_number: body.kot_number ?? tok.kot_number ?? null,
        printed_by: printedBy,
        print_channel: printChannel,
        kot_version: Number(tok.kot_version ?? 1) || 1,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("[merchant kot-print] audit failed:", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
