/**
 * GET /api/public/merchant-app-assets
 * Public read of merchant CMS images (super-admin app_static_assets) for Orders empty states.
 * Response shape matches partnersite `/api/public/merchant-app-assets`.
 */
import { NextResponse } from "next/server";
import { listAppStaticAssets } from "@/lib/db/operations/app-static-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await listAppStaticAssets("merchant");
    const items = rows.map((r) => {
      const shortId = r.id.startsWith("merchant.") ? r.id.slice("merchant.".length) : r.id;
      const url = (r.proxy_url || "").trim() || null;
      return {
        id: shortId,
        fullId: r.id,
        section: r.section,
        label: r.label,
        description: r.description,
        proxyUrl: url,
        url,
        sortOrder: r.sort_order,
      };
    });
    const assets: Record<string, (typeof items)[number]> = {};
    for (const item of items) {
      assets[item.id] = item;
    }
    return NextResponse.json(
      { app: "merchant", assets, items },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("[GET /api/public/merchant-app-assets]", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
