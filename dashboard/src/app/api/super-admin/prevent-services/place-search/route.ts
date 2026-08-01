/**
 * POST /api/super-admin/prevent-services/place-search
 * Flat place search via Mapbox (same engine family as customer app).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: { q?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (q.length < 2) {
    return NextResponse.json({ error: "Query too short", results: [] }, { status: 400 });
  }

  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    process.env.MAPBOX_PUBLIC_TOKEN ||
    process.env.MAPBOX_ACCESS_TOKEN;
  if (!mapboxToken) {
    return NextResponse.json({ error: "Mapbox token not configured", results: [] }, { status: 500 });
  }

  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?access_token=${mapboxToken}&country=IN&limit=8&types=poi,address,place,locality,neighborhood,postcode`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Search failed", results: [] }, { status: 502 });
    }
    const data = (await res.json()) as {
      features?: Array<{
        id?: string;
        place_name?: string;
        text?: string;
        center?: [number, number];
        place_type?: string[];
        properties?: { address?: string };
        context?: Array<{ id: string; text: string }>;
      }>;
    };

    const results = (data.features ?? [])
      .filter((f) => Array.isArray(f.center) && f.center.length === 2)
      .map((f) => {
        const [longitude, latitude] = f.center as [number, number];
        const ctx = (f.context || []).reduce(
          (acc: Record<string, string>, c) => {
            if (c.id.startsWith("place.")) acc.city = c.text;
            else if (c.id.startsWith("region.")) acc.state = c.text;
            else if (c.id.startsWith("postcode.")) acc.pincode = c.text;
            else if (c.id.startsWith("locality.")) acc.locality = c.text;
            return acc;
          },
          {}
        );
        return {
          placeId: f.id ?? null,
          locationName: f.text || f.place_name || q,
          address: f.place_name || null,
          latitude,
          longitude,
          city: ctx.city ?? null,
          state: ctx.state ?? null,
          pincode: ctx.pincode ?? null,
          featureType: f.place_type?.[0] ?? null,
        };
      });

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed", results: [] },
      { status: 500 }
    );
  }
}
