/**
 * GET /api/parent-merchant/get-by-phone?phone=...
 * Get parent merchant by registered phone (for merchant flows).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const phone = url.searchParams.get("phone") ?? "";
  if (!phone)
    return NextResponse.json({ error: "phone required" }, { status: 400 });

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("merchant_parents")
    .select("id, parent_merchant_id, registered_phone")
    .eq("registered_phone", phone)
    .maybeSingle();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({}, { status: 404 });
  return NextResponse.json(data);
}
