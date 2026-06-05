import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadMerchantMarketInsights } from "@/lib/merchant-store-competitors";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreInternalId(storeId: string): Promise<number | null> {
  const db = getDb();
  const { data, error } = await db
    .from("merchant_stores")
    .select("id")
    .eq("store_id", storeId.trim())
    .maybeSingle();
  if (error || !data) return null;
  return data.id as number;
}

/**
 * GET /api/merchant/market/insights?storeId=GMMC1025
 */
export async function GET(req: NextRequest) {
  try {
    const storeId =
      req.nextUrl.searchParams.get("storeId") ?? req.nextUrl.searchParams.get("store_id");
    if (!storeId?.trim()) {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 });
    }
    const storePk = await resolveStoreInternalId(storeId);
    if (storePk == null) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    const scope = req.nextUrl.searchParams.get("scope");
    const limitRaw = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 20) : 10;
    const insights = await loadMerchantMarketInsights(storePk, scope, limit);
    if (!insights) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, ...insights });
  } catch (e) {
    console.error("[merchant/market/insights]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
