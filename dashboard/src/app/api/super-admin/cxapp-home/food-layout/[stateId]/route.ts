import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getStateFoodHomeLayoutConfig,
  saveStateGridFirstSubscriptionRow,
  upsertStateFoodHomeLayout,
} from "@/lib/db/operations/cxapp-food-home-layout";
import {
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  parseFoodHomeLayoutKey,
  parseGridFirstSubscriptionRowBgColor,
} from "@/lib/cxapp-home/food-home-layout";

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
    const config = await getStateFoodHomeLayoutConfig(stateId);
    return NextResponse.json({
      stateId,
      layoutKey: config.layoutKey,
      gridFirstHeroMedia: config.gridFirstHeroMedia,
      gridFirstSubscriptionRowEnabled: config.gridFirstSubscriptionRow.enabled,
      gridFirstSubscriptionRowText: config.gridFirstSubscriptionRow.text,
      gridFirstSubscriptionRowBgColor: config.gridFirstSubscriptionRow.backgroundColor,
    });
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
    const body = (await request.json()) as {
      layoutKey?: unknown;
      gridFirstSubscriptionRowEnabled?: unknown;
      gridFirstSubscriptionRowText?: unknown;
      gridFirstSubscriptionRowBgColor?: unknown;
    };

    const layoutKey = body.layoutKey != null ? parseFoodHomeLayoutKey(body.layoutKey) : null;
    if (body.layoutKey != null && !layoutKey) {
      return NextResponse.json({ error: "Invalid layoutKey" }, { status: 400 });
    }

    if (layoutKey) {
      await upsertStateFoodHomeLayout(stateId, layoutKey);
    }

    const hasSubscriptionPatch =
      typeof body.gridFirstSubscriptionRowEnabled === "boolean" ||
      typeof body.gridFirstSubscriptionRowText === "string" ||
      typeof body.gridFirstSubscriptionRowBgColor === "string";

    let subscriptionRow = DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW;
    if (hasSubscriptionPatch) {
      const current = await getStateFoodHomeLayoutConfig(stateId);
      subscriptionRow = await saveStateGridFirstSubscriptionRow(stateId, {
        enabled:
          typeof body.gridFirstSubscriptionRowEnabled === "boolean"
            ? body.gridFirstSubscriptionRowEnabled
            : current.gridFirstSubscriptionRow.enabled,
        text:
          typeof body.gridFirstSubscriptionRowText === "string"
            ? body.gridFirstSubscriptionRowText
            : current.gridFirstSubscriptionRow.text,
        backgroundColor:
          typeof body.gridFirstSubscriptionRowBgColor === "string"
            ? parseGridFirstSubscriptionRowBgColor(body.gridFirstSubscriptionRowBgColor)
            : current.gridFirstSubscriptionRow.backgroundColor,
      });
    } else {
      const current = await getStateFoodHomeLayoutConfig(stateId);
      subscriptionRow = current.gridFirstSubscriptionRow;
    }

    const savedLayoutKey = layoutKey ?? (await getStateFoodHomeLayoutConfig(stateId)).layoutKey;

    return NextResponse.json({
      stateId,
      layoutKey: savedLayoutKey,
      gridFirstSubscriptionRowEnabled: subscriptionRow.enabled,
      gridFirstSubscriptionRowText: subscriptionRow.text,
      gridFirstSubscriptionRowBgColor: subscriptionRow.backgroundColor,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save layout";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
