/**
 * Get Users for Reports To Selector
 * GET /api/users/list-for-selector - Returns list of users for dropdown/selector
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import { systemUsers } from "@/lib/db/schema";
import { eq, and, or, ilike, isNull, sql } from "drizzle-orm";

export const runtime = 'nodejs';

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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const excludeUserId = searchParams.get("excludeUserId");
    const limit = parseInt(searchParams.get("limit") || "50");
    const status = searchParams.get("status"); // Make status optional - don't filter by default

    const db = getDb();

    // Build query conditions
    const conditions: any[] = [];

    // Exclude deleted users
    conditions.push(isNull(systemUsers.deletedAt));

    // Filter by status if provided (optional - allows searching all users)
    // Valid status values: ACTIVE, SUSPENDED, DISABLED, PENDING_ACTIVATION, LOCKED
    if (status) {
      conditions.push(eq(systemUsers.status, status as any));
    }
    // Note: Deleted users are already filtered by deleted_at IS NULL above

    // Exclude specific user ID (for edit mode)
    if (excludeUserId) {
      const excludeId = parseInt(excludeUserId);
      if (!isNaN(excludeId)) {
        conditions.push(sql`${systemUsers.id} != ${excludeId}`);
      }
    }

    // Search filter (by name, email, system_user_id, role, subrole, or ID)
    if (search) {
      const searchTrimmed = search.trim();
      
      // Try to parse as numeric ID first
      const numericId = parseInt(searchTrimmed);
      const isNumericId = !isNaN(numericId) && searchTrimmed === numericId.toString();
      
      const searchConditions: any[] = [
        ilike(systemUsers.fullName, `%${searchTrimmed}%`),
        ilike(systemUsers.email, `%${searchTrimmed}%`),
        ilike(systemUsers.systemUserId, `%${searchTrimmed}%`),
        // Cast enum to text for ilike operation
        sql`CAST(${systemUsers.primaryRole} AS TEXT) ILIKE ${`%${searchTrimmed}%`}`,
        ilike(systemUsers.subrole, `%${searchTrimmed}%`),
        ilike(systemUsers.subroleOther, `%${searchTrimmed}%`),
        ilike(systemUsers.firstName, `%${searchTrimmed}%`),
        ilike(systemUsers.lastName, `%${searchTrimmed}%`),
      ];
      
      // If search is a number, also search by ID (exact match for ID)
      if (isNumericId) {
        searchConditions.push(eq(systemUsers.id, numericId));
      }
      
      // Also search by system_user_id if it's numeric-like
      if (isNumericId) {
        // Search for system_user_id that contains the number
        searchConditions.push(ilike(systemUsers.systemUserId, `%${numericId}%`));
      }
      
      conditions.push(or(...searchConditions)!);
    }

    // Fetch users
    const users = await db
      .select({
        id: systemUsers.id,
        systemUserId: systemUsers.systemUserId,
        fullName: systemUsers.fullName,
        email: systemUsers.email,
        primaryRole: systemUsers.primaryRole,
        subrole: systemUsers.subrole,
        subroleOther: systemUsers.subroleOther,
        status: systemUsers.status,
      })
      .from(systemUsers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(limit)
      .orderBy(systemUsers.fullName);

    // Format response
    const formattedUsers = users.map((user) => ({
      id: user.id,
      systemUserId: user.systemUserId,
      fullName: user.fullName,
      email: user.email,
      primaryRole: user.primaryRole,
      subrole: user.subrole,
      subroleOther: user.subroleOther,
      displayLabel: `${user.systemUserId} - ${user.fullName} (${user.primaryRole}${user.subrole ? ` - ${user.subrole}` : ""})`,
    }));

    return NextResponse.json({
      success: true,
      data: formattedUsers,
      count: formattedUsers.length,
    });
  } catch (error) {
    console.error("[GET /api/users/list-for-selector] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
