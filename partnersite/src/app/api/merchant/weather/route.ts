import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { fetchBackendJson } from "@/lib/fetch-backend";
import { client as sql } from "@/lib/drizzle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MerchantWeatherPayload = {
  severity: string;
  weatherCondition: string;
  zoneName: string | null;
  city: string | null;
  chipLabel: string | null;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  showBanner: boolean;
  etaDelayMinutes: number;
  updatedAt: string | null;
};

const CLEAR_FALLBACK: MerchantWeatherPayload = {
  severity: "CLEAR",
  weatherCondition: "Clear",
  zoneName: null,
  city: null,
  chipLabel: null,
  bannerTitle: null,
  bannerSubtitle: null,
  showBanner: false,
  etaDelayMinutes: 0,
  updatedAt: null,
};

const WEATHER_FETCH_MS = 5_000;

/** GET /api/merchant/weather?storeId=GMMC1015 — backend-driven zone weather for merchant UI. */
export async function GET(req: NextRequest) {
  try {
    const storeId =
      req.nextUrl.searchParams.get("storeId") ?? req.nextUrl.searchParams.get("store_id");
    if (!storeId?.trim()) {
      return NextResponse.json({ error: "storeId is required" }, { status: 400 });
    }

    const gate = await assertStoreAccess(storeId.trim());
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const rows = await sql`
      SELECT latitude, longitude, city
      FROM merchant_stores
      WHERE id = ${gate.storeIdNum}
      LIMIT 1
    `;
    const store = rows[0] as { latitude?: string | number | null; longitude?: string | number | null; city?: string | null } | undefined;
    const lat = Number(store?.latitude);
    const lng = Number(store?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(CLEAR_FALLBACK);
    }

    const city = store?.city != null ? String(store.city) : undefined;
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
    });
    if (city) params.set("city", city);

    const data = await fetchBackendJson<MerchantWeatherPayload>(
      `/v1/weather/merchant?${params.toString()}`,
      { timeoutMs: WEATHER_FETCH_MS }
    );
    if (!data) {
      return NextResponse.json(CLEAR_FALLBACK);
    }

    return NextResponse.json(data);
  } catch (e) {
    console.warn("[merchant/weather]", e);
    return NextResponse.json(CLEAR_FALLBACK);
  }
}
