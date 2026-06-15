import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { resolveBackendApiBaseUrl } from "@/lib/backend-api-url";
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

    const backendUrl = resolveBackendApiBaseUrl();
    if (!backendUrl) {
      return NextResponse.json(CLEAR_FALLBACK);
    }

    const city = store?.city != null ? String(store.city) : undefined;
    const url = new URL(`${backendUrl}/v1/weather/merchant`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lng", String(lng));
    if (city) url.searchParams.set("city", city);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(WEATHER_FETCH_MS) });
    if (!res.ok) {
      return NextResponse.json(CLEAR_FALLBACK);
    }

    const data = (await res.json()) as MerchantWeatherPayload;
    return NextResponse.json(data);
  } catch (e) {
    const isTimeout =
      e instanceof Error &&
      (e.name === "TimeoutError" || e.name === "AbortError" || /timeout|aborted/i.test(e.message));
    if (!isTimeout) {
      console.warn("[merchant/weather]", e);
    }
    return NextResponse.json(CLEAR_FALLBACK);
  }
}
