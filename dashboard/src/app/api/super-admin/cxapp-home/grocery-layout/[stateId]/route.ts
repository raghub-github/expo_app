import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getStateGroceryHomeLayoutConfig,
  upsertStateGroceryHomeLayout,
} from "@/lib/db/operations/cxapp-grocery-home-layout";
import { parseFoodHomeLayoutKey } from "@/lib/cxapp-home/food-home-layout";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ stateId: string }> };

export async function GET(_request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { stateId } = await ctx.params;
  if (!stateId?.trim()) {
    return NextResponse.json({ error: "stateId required" }, { status: 400 });
  }

  try {
    const config = await getStateGroceryHomeLayoutConfig(stateId);
    return NextResponse.json(
      {
        stateId,
        layoutKey: config.layoutKey,
        gridFirstHeroMedia: config.gridFirstHeroMedia,
      },
      { headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=15" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load layout";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { stateId } = await ctx.params;
  if (!stateId?.trim()) {
    return NextResponse.json({ error: "stateId required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { layoutKey?: unknown };
    const layoutKey = parseFoodHomeLayoutKey(body.layoutKey);
    if (!layoutKey || (layoutKey !== "classic" && layoutKey !== "grid_first")) {
      return NextResponse.json(
        { error: "layoutKey must be classic or grid_first for grocery" },
        { status: 400 }
      );
    }
    const config = await upsertStateGroceryHomeLayout(stateId, layoutKey);
    return NextResponse.json({
      stateId,
      layoutKey: config.layoutKey,
      gridFirstHeroMedia: config.gridFirstHeroMedia,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save layout";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
