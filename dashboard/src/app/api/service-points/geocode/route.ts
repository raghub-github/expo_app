import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = 'nodejs';

/**
 * POST /api/service-points/geocode
 * Geocode city name to coordinates using Mapbox Geocoding API
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { city } = body;

    if (!city || typeof city !== 'string') {
      return NextResponse.json(
        { success: false, error: "City name is required" },
        { status: 400 }
      );
    }

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!mapboxToken) {
      return NextResponse.json(
        { success: false, error: "Mapbox token not configured" },
        { status: 500 }
      );
    }

    // Geocode city name to coordinates
    // Focus on India by adding country code
    const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(city + ', India')}.json?access_token=${mapboxToken}&country=IN&limit=1`;

    const response = await fetch(geocodeUrl);
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      return NextResponse.json(
        { success: false, error: `Could not find coordinates for city: ${city}` },
        { status: 404 }
      );
    }

    const feature = data.features[0];
    const [longitude, latitude] = feature.center;
    const placeName = feature.place_name;

    // Validate India bounds
    if (latitude < 6 || latitude > 37 || longitude < 68 || longitude > 98) {
      return NextResponse.json(
        { success: false, error: "Coordinates are outside India bounds" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        latitude,
        longitude,
        placeName,
        city: city,
      },
    });
  } catch (error) {
    console.error("[geocode API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
