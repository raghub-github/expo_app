import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = 'nodejs';

/**
 * GET /api/service-points
 * Fetch all active service points
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const sql = getSql();
    const servicePoints = await sql`
      SELECT 
        id,
        name,
        city,
        latitude,
        longitude,
        address,
        is_active,
        created_at,
        updated_at
      FROM service_points
      WHERE is_active = true
      ORDER BY created_at DESC
    `;

    return NextResponse.json({
      success: true,
      data: servicePoints,
    });
  } catch (error) {
    console.error("[service-points API] Error:", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/service-points
 * Create a new service point (super admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Only super admins can create service points" },
        { status: 403 }
      );
    }
    if (!user.email) {
      return NextResponse.json(
        { success: false, error: "Account email is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, city, latitude, longitude, address } = body;

    // Validation
    if (!name || !city || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { success: false, error: "Name, city, latitude, and longitude are required" },
        { status: 400 }
      );
    }

    // Validate India bounds
    if (latitude < 6 || latitude > 37 || longitude < 68 || longitude > 98) {
      return NextResponse.json(
        { success: false, error: "Coordinates must be within India bounds" },
        { status: 400 }
      );
    }

    const userEmail = user.email?.trim();
    if (!userEmail) {
      return NextResponse.json(
        { success: false, error: "Authenticated user has no email; cannot resolve system user" },
        { status: 400 }
      );
    }

    // Get system user ID for created_by
    const sql = getSql();
    const [systemUser] = await sql`
      SELECT id FROM system_users WHERE email = ${userEmail}
    `;

    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "System user not found" },
        { status: 404 }
      );
    }

    // Insert service point
    const [newServicePoint] = await sql`
      INSERT INTO service_points (name, city, latitude, longitude, address, created_by)
      VALUES (${name}, ${city}, ${latitude}, ${longitude}, ${address || null}, ${systemUser.id})
      RETURNING id, name, city, latitude, longitude, address, is_active, created_at, updated_at
    `;

    return NextResponse.json({
      success: true,
      data: newServicePoint,
    });
  } catch (error) {
    console.error("[service-points API] Error creating service point:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/service-points
 * Update a service point (super admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Only super admins can update service points" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, name, city, latitude, longitude, address, is_active } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Service point ID is required" },
        { status: 400 }
      );
    }

    // Validate coordinates if provided
    if (latitude !== undefined && (latitude < 6 || latitude > 37)) {
      return NextResponse.json(
        { success: false, error: "Latitude must be within India bounds (6-37)" },
        { status: 400 }
      );
    }

    if (longitude !== undefined && (longitude < 68 || longitude > 98)) {
      return NextResponse.json(
        { success: false, error: "Longitude must be within India bounds (68-98)" },
        { status: 400 }
      );
    }

    const sql = getSql();

    const setFragments: string[] = [];
    const params: unknown[] = [];
    let n = 1;
    if (name !== undefined) {
      setFragments.push(`name = $${n++}`);
      params.push(name);
    }
    if (city !== undefined) {
      setFragments.push(`city = $${n++}`);
      params.push(city);
    }
    if (latitude !== undefined) {
      setFragments.push(`latitude = $${n++}`);
      params.push(latitude);
    }
    if (longitude !== undefined) {
      setFragments.push(`longitude = $${n++}`);
      params.push(longitude);
    }
    if (address !== undefined) {
      setFragments.push(`address = $${n++}`);
      params.push(address);
    }
    if (is_active !== undefined) {
      setFragments.push(`is_active = $${n++}`);
      params.push(is_active);
    }

    if (setFragments.length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    const [updatedServicePoint] = await sql.unsafe(
      `UPDATE service_points SET ${setFragments.join(", ")}, updated_at = NOW() WHERE id = $${n} RETURNING id, name, city, latitude, longitude, address, is_active, created_at, updated_at`,
      [...params, id] as never[]
    );
    if (!updatedServicePoint) {
      return NextResponse.json(
        { success: false, error: "Service point not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedServicePoint,
    });
  } catch (error) {
    console.error("[service-points API] Error updating service point:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/service-points
 * Delete a service point (super admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    if (!userIsSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Only super admins can delete service points" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Service point ID is required" },
        { status: 400 }
      );
    }

    const sql = getSql();
    const [deletedServicePoint] = await sql`
      DELETE FROM service_points
      WHERE id = ${parseInt(id)}
      RETURNING id, name, city
    `;

    if (!deletedServicePoint) {
      return NextResponse.json(
        { success: false, error: "Service point not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { message: "Service point deleted successfully", id: deletedServicePoint.id },
    });
  } catch (error) {
    console.error("[service-points API] Error deleting service point:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
