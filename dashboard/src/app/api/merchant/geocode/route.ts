/**
 * POST /api/merchant/geocode
 * Forward geocode: search by address/city text, return coordinates and address parts (Mapbox).
 * Body: { q: string, types?: string, limit?: number }
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
        { status: 400 },
      );
    }
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN;
    if (!mapboxToken) {
      return NextResponse.json(
        { success: false, error: "Mapbox token not configured" },
        { status: 500 },
      );
    }

    const types =
      typeof body.types === "string" && body.types.trim()
        ? body.types.trim()
        : "place,locality,address,poi,district,neighborhood,postcode";
    const limitRaw = Number(body.limit ?? 8);
    const limit = Number.isFinite(limitRaw) ? Math.min(10, Math.max(1, Math.floor(limitRaw))) : 8;

    const params = new URLSearchParams({
      access_token: mapboxToken,
      country: "IN",
      language: "en",
      limit: String(limit),
      types,
      autocomplete: "true",
      // Bias toward North India; still returns results nationwide.
      proximity: "77.1025,28.7041",
    });
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: "Geocoding request failed" },
        { status: 502 },
      );
    }
    const data = await res.json();
    const features = data.features ?? [];
    const results = features.slice(0, limit).map(
      (feature: {
        center: [number, number];
        text?: string;
        place_name?: string;
        place_type?: string[];
        context?: Array<{ id: string; text: string }>;
      }) => {
        const [longitude, latitude] = feature.center;
        const context = (feature.context || []).reduce(
          (acc: Record<string, string>, c: { id: string; text: string }) => {
            if (c.id.startsWith("place.")) acc.city = c.text;
            else if (c.id.startsWith("locality.")) acc.city = acc.city || c.text;
            else if (c.id.startsWith("district.")) acc.city = acc.city || c.text;
            else if (c.id.startsWith("region.")) acc.state = c.text;
            else if (c.id.startsWith("postcode.")) acc.postal_code = c.text;
            else if (c.id.startsWith("country.")) acc.country = c.text;
            return acc;
          },
          {},
        );
        const cityName =
          context.city ||
          feature.text ||
          (typeof feature.place_name === "string" ? feature.place_name.split(",")[0]?.trim() : null);
        return {
          latitude,
          longitude,
          place_name: feature.place_name ?? null,
          text: feature.text ?? null,
          city: cityName ?? null,
          state: context.state ?? null,
          postal_code: context.postal_code ?? null,
          country: context.country ?? null,
          place_type: Array.isArray(feature.place_type) ? feature.place_type : [],
        };
      },
    );
    return NextResponse.json({ success: true, results });
  } catch (e) {
    console.error("[POST /api/merchant/geocode]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 },
    );
  }
}
