import { NextRequest, NextResponse } from "next/server";
import {
  getCuisineListEnabled,
  listActiveRequirementsForStoreType,
} from "@/lib/db/operations/merchant-onboarding-document-types";
import { normalizeStoreTypeCode } from "@/lib/onboarding-store-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const storeType = normalizeStoreTypeCode(req.nextUrl.searchParams.get("storeType") || "");
    if (!storeType) {
      return json({ success: false, error: "storeType is required" }, 400);
    }

    const [docs, cuisineListEnabled] = await Promise.all([
      listActiveRequirementsForStoreType(storeType),
      getCuisineListEnabled(storeType),
    ]);
    return json({
      success: true,
      storeType,
      docs,
      cuisineListEnabled,
    });
  } catch (e) {
    console.warn("[store-document-requirements] error:", e);
    return json({ success: false, docs: null }, 500);
  }
}
