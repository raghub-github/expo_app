/**
 * GET — list app static assets for super-admin UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { listAppStaticAssets } from "@/lib/db/operations/app-static-assets";
import { parseAppStaticAssetApp } from "@/lib/app-static-assets/shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const app = parseAppStaticAssetApp(new URL(request.url).searchParams.get("app") ?? "");
  if (!app) {
    return NextResponse.json(
      { error: "app query required (customer | rider | merchant)" },
      { status: 400 }
    );
  }

  try {
    const items = await listAppStaticAssets(app);
    return NextResponse.json({ app, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load assets";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
