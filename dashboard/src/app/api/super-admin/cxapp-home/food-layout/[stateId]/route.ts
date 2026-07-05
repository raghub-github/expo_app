import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getStateFoodHomeLayoutConfig,
  saveStateGridFirstSubscriptionRow,
  saveStateGridFirstUnder250,
  upsertStateFoodHomeLayout,
} from "@/lib/db/operations/cxapp-food-home-layout";
import {
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  parseFoodHomeLayoutKey,
  parseGridFirstSubscriptionRowBgColor,
  parseGridFirstUnder250Enabled,
  parseGridFirstUnder250ImageUrl,
  parseGridFirstUnder250MaxPrice,
  parseGridFirstUnder250Title,
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
      gridFirstUnder250Enabled: config.gridFirstUnder250.enabled,
      gridFirstUnder250MaxPrice: config.gridFirstUnder250.maxPrice,
      gridFirstUnder250Title: config.gridFirstUnder250.title,
      gridFirstUnder250FilterLabel: config.gridFirstUnder250.filterLabel,
      gridFirstUnder250TabImageUrl: config.gridFirstUnder250.tabImageUrl,
      gridFirstUnder250HeroImageUrl: config.gridFirstUnder250.heroImageUrl,
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
      gridFirstUnder250Enabled?: unknown;
      gridFirstUnder250MaxPrice?: unknown;
      gridFirstUnder250Title?: unknown;
      gridFirstUnder250FilterLabel?: unknown;
      gridFirstUnder250TabImageUrl?: unknown;
      gridFirstUnder250HeroImageUrl?: unknown;
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

    const hasUnder250Patch =
      typeof body.gridFirstUnder250Enabled === "boolean" ||
      body.gridFirstUnder250MaxPrice != null ||
      typeof body.gridFirstUnder250Title === "string" ||
      typeof body.gridFirstUnder250FilterLabel === "string" ||
      body.gridFirstUnder250TabImageUrl !== undefined ||
      body.gridFirstUnder250HeroImageUrl !== undefined;

    let under250 = DEFAULT_GRID_FIRST_UNDER_250;
    if (hasUnder250Patch) {
      const current = await getStateFoodHomeLayoutConfig(stateId);
      under250 = await saveStateGridFirstUnder250(stateId, {
        enabled:
          typeof body.gridFirstUnder250Enabled === "boolean"
            ? body.gridFirstUnder250Enabled
            : current.gridFirstUnder250.enabled,
        maxPrice:
          body.gridFirstUnder250MaxPrice != null
            ? parseGridFirstUnder250MaxPrice(body.gridFirstUnder250MaxPrice)
            : current.gridFirstUnder250.maxPrice,
        title:
          typeof body.gridFirstUnder250Title === "string"
            ? body.gridFirstUnder250Title
            : current.gridFirstUnder250.title,
        filterLabel:
          typeof body.gridFirstUnder250FilterLabel === "string"
            ? body.gridFirstUnder250FilterLabel
            : current.gridFirstUnder250.filterLabel,
        tabImageUrl:
          body.gridFirstUnder250TabImageUrl !== undefined
            ? parseGridFirstUnder250ImageUrl(body.gridFirstUnder250TabImageUrl)
            : current.gridFirstUnder250.tabImageUrl,
        heroImageUrl:
          body.gridFirstUnder250HeroImageUrl !== undefined
            ? parseGridFirstUnder250ImageUrl(body.gridFirstUnder250HeroImageUrl)
            : current.gridFirstUnder250.heroImageUrl,
      });
    } else {
      const current = await getStateFoodHomeLayoutConfig(stateId);
      under250 = current.gridFirstUnder250;
    }

    const savedLayoutKey = layoutKey ?? (await getStateFoodHomeLayoutConfig(stateId)).layoutKey;

    return NextResponse.json({
      stateId,
      layoutKey: savedLayoutKey,
      gridFirstSubscriptionRowEnabled: subscriptionRow.enabled,
      gridFirstSubscriptionRowText: subscriptionRow.text,
      gridFirstSubscriptionRowBgColor: subscriptionRow.backgroundColor,
      gridFirstUnder250Enabled: under250.enabled,
      gridFirstUnder250MaxPrice: under250.maxPrice,
      gridFirstUnder250Title: under250.title,
      gridFirstUnder250FilterLabel: under250.filterLabel,
      gridFirstUnder250TabImageUrl: under250.tabImageUrl,
      gridFirstUnder250HeroImageUrl: under250.heroImageUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save layout";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
