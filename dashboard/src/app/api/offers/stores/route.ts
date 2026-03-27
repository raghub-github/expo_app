/**
 * GET /api/offers/stores - List merchant stores for offer creation dropdown
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT id, store_id, store_name, store_display_name
      FROM merchant_stores
      ORDER BY store_name
      LIMIT 500
    `;

    const stores = (rows as unknown as { id: number; store_id: string; store_name: string; store_display_name: string | null }[]).map(      (r) => ({
        id: r.id,
        storeId: r.store_id,
        name: r.store_display_name ?? r.store_name ?? String(r.store_id),
      })
    );

    return NextResponse.json({ success: true, data: stores });
  } catch (error) {
    console.error("[offers/stores API] Error:", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
