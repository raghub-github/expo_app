/**
 * GET /api/merchant/reverse-geocode?lat=...&lng=...
 * Reverse geocode coordinates to address using Mapbox Geocoding API.
 * Used by verification location picker to update address from map coordinates.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const latNum = lat != null ? parseFloat(lat) : NaN;
    const lngNum = lng != null ? parseFloat(lng) : NaN;
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return NextResponse.json(
        { success: false, error: "Valid lat and lng query params required" },
        { status: 400 }
      );
    }
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN;
    if (!mapboxToken) {
      return NextResponse.json(
        { success: false, error: "Mapbox token not configured" },
        { status: 500 }
      );
    }
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lngNum},${latNum}.json?access_token=${mapboxToken}&country=IN&limit=1`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "Geocoding request failed" },
        { status: 502 }
      );
    }
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) {
      return NextResponse.json({
        success: true,
        place_name: null,
        address: null,
        city: null,
        state: null,
        postal_code: null,
        country: null,
      });
    }
    const props = feature.properties || {};
    const context = (feature.context || []).reduce((acc: Record<string, string>, c: { id: string; text: string }) => {
      if (c.id.startsWith("place.")) acc.city = c.text;
      else if (c.id.startsWith("region.")) acc.state = c.text;
      else if (c.id.startsWith("postcode.")) acc.postal_code = c.text;
      else if (c.id.startsWith("country.")) acc.country = c.text;
      return acc;
    }, {});
    return NextResponse.json({
      success: true,
      place_name: feature.place_name ?? null,
      address: feature.place_name ?? null,
      city: context.city ?? null,
      state: context.state ?? null,
      postal_code: context.postal_code ?? null,
      country: context.country ?? null,
    });
  } catch (e) {
    console.error("[GET /api/merchant/reverse-geocode]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
