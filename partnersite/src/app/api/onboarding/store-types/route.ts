import { NextResponse } from "next/server";
import { client } from "@/lib/drizzle";

export const runtime = "nodejs";

function normalizeStoreType(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, "_");
}

/**
 * Same catalog as Order acceptance settings (and dashboard RX/MX Merchant docs).
 * RIDER is excluded.
 */
export async function GET() {
  try {
    const rows = await client<{ store_type: string }[]>`
      SELECT DISTINCT store_type
      FROM platform_food_acceptance_settings_by_store_type
      WHERE store_type IS NOT NULL AND btrim(store_type) <> ''
      ORDER BY store_type ASC
    `;
    const seen = new Set<string>();
    const storeTypes: string[] = [];
    for (const r of rows) {
      const t = normalizeStoreType(r.store_type);
      if (!t || t === "RIDER" || seen.has(t)) continue;
      seen.add(t);
      storeTypes.push(t);
    }
    return NextResponse.json({ success: true, storeTypes });
  } catch (e) {
    console.warn("[onboarding store-types] error:", e);
    return NextResponse.json({ success: true, storeTypes: [] });
  }
}
