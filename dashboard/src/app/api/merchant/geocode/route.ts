/**
 * POST /api/merchant/geocode
 * Forward geocode: search by address text, return coordinates and address parts (Mapbox Geocoding API).
 * Body: { q: string }
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const q = typeof body.q === "string" ? body.q.trim() : "";
    if (!q) {
      return NextResponse.json(
        { success: false, error: "Search query 'q' is required" },
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
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mapboxToken}&country=IN&limit=3`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "Geocoding request failed" },
        { status: 502 }
      );
    }
    const data = await res.json();
    const features = data.features ?? [];
    const results = features.slice(0, 3).map((feature: { center: [number, number]; place_name?: string; context?: Array<{ id: string; text: string }> }) => {
      const [longitude, latitude] = feature.center;
      const context = (feature.context || []).reduce(
        (acc: Record<string, string>, c: { id: string; text: string }) => {
          if (c.id.startsWith("place.")) acc.city = c.text;
          else if (c.id.startsWith("region.")) acc.state = c.text;
          else if (c.id.startsWith("postcode.")) acc.postal_code = c.text;
          else if (c.id.startsWith("country.")) acc.country = c.text;
          return acc;
        },
        {}
      );
      return {
        latitude,
        longitude,
        place_name: feature.place_name ?? null,
        city: context.city ?? null,
        state: context.state ?? null,
        postal_code: context.postal_code ?? null,
        country: context.country ?? null,
      };
    });
    return NextResponse.json({ success: true, results });
  } catch (e) {
    console.error("[POST /api/merchant/geocode]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
