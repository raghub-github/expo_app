import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = 'nodejs';

/**
 * GET /api/service-points
 * Fetch all active service points
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
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
 * POST /api/service-points
 * Create a new service point (super admin only)
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

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    if (!userIsSuperAdmin) {
      return NextResponse.json(
        { success: false, error: "Only super admins can create service points" },
        { status: 403 }
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

    // Get system user ID for created_by
    const sql = getSql();
    const [systemUser] = await sql`
      SELECT id FROM system_users WHERE email = ${session.user.email}
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
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
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
    
    // Build update query using template literals for safety
    const updateParts: any[] = [];
    
    if (name !== undefined) {
      updateParts.push(sql`name = ${name}`);
    }
    if (city !== undefined) {
      updateParts.push(sql`city = ${city}`);
    }
    if (latitude !== undefined) {
      updateParts.push(sql`latitude = ${latitude}`);
    }
    if (longitude !== undefined) {
      updateParts.push(sql`longitude = ${longitude}`);
    }
    if (address !== undefined) {
      updateParts.push(sql`address = ${address}`);
    }
    if (is_active !== undefined) {
      updateParts.push(sql`is_active = ${is_active}`);
    }

    if (updateParts.length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    // Combine update parts
    const updateClause = sql.join(updateParts, sql`, `);
    const [updatedServicePoint] = await sql`
      UPDATE service_points
      SET ${updateClause}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, city, latitude, longitude, address, is_active, created_at, updated_at
    `;

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
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if user is super admin
    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
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
