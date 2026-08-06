import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getStateFoodHomeLayoutConfig } from "@/lib/db/operations/cxapp-food-home-layout";
import {
  fetchBackendFoodHomePreview,
  fetchFeaturedCustomerSubscriptionPlanName,
  listFoodHomePreviewCategories,
  resolveStatePreviewAnchor,
} from "@/lib/db/operations/cxapp-food-home-preview";
import { getUserAppCategoryAllTab } from "@/lib/db/operations/user-app-category-meta";
import type { FoodHomePreviewPayload } from "@/lib/cxapp-home/food-home-preview-types";

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
    const metaPromise = Promise.all([
      listFoodHomePreviewCategories(),
      getUserAppCategoryAllTab("FOOD"),
      getStateFoodHomeLayoutConfig(stateId),
      fetchFeaturedCustomerSubscriptionPlanName(),
    ]);

    const anchor = await resolveStatePreviewAnchor(stateId);
    if (!anchor) {
      return NextResponse.json({ error: "State not found" }, { status: 404 });
    }

    // Overlap backend merchants/offers with any remaining meta queries.
    const [backend, [categories, allTab, layoutConfig, subscriptionPlanName]] = await Promise.all([
      fetchBackendFoodHomePreview({ anchor }),
      metaPromise,
    ]);

    const payload: FoodHomePreviewPayload = {
      stateId,
      stateName: anchor.stateName,
      areaLabel: anchor.areaLabel,
      layoutKey: layoutConfig.layoutKey,
      gridFirstHeroMedia: layoutConfig.gridFirstHeroMedia,
      categories,
      allTab,
      offers: backend.offers,
      lovedMerchants: backend.lovedMerchants,
      restaurants: backend.restaurants,
      storeCountLabel: backend.storeCountLabel,
      hasLocationSample: anchor.lat != null && anchor.lng != null,
      subscriptionPlanName,
      gridFirstSubscriptionRowEnabled: layoutConfig.gridFirstSubscriptionRow.enabled,
      gridFirstSubscriptionRowText: layoutConfig.gridFirstSubscriptionRow.text,
      gridFirstSubscriptionRowBgColor: layoutConfig.gridFirstSubscriptionRow.backgroundColor,
      gridFirstUnder250Enabled: layoutConfig.gridFirstUnder250.enabled,
      gridFirstUnder250MaxPrice: layoutConfig.gridFirstUnder250.maxPrice,
      gridFirstUnder250Title: layoutConfig.gridFirstUnder250.title,
      gridFirstUnder250FilterLabel: layoutConfig.gridFirstUnder250.filterLabel,
      gridFirstUnder250TabImageUrl: layoutConfig.gridFirstUnder250.tabImageUrl,
      gridFirstUnder250HeroImageUrl: layoutConfig.gridFirstUnder250.heroImageUrl,
    };

    return NextResponse.json(payload, {
      headers: {
        // Short private cache — preview is expensive (DB + backend) but not realtime-critical.
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load preview";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
