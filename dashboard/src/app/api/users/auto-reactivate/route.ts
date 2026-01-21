/**
 * Auto-reactivate suspended users whose suspension period has expired
 * This endpoint should be called by a cron job or scheduled task
 * GET /api/users/auto-reactivate - Check and reactivate expired suspensions
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { systemUsers } from "@/lib/db/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";

export const runtime = 'nodejs';

/**
 * GET /api/users/auto-reactivate
 * Check for users with expired suspensions and reactivate them
 */
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const now = new Date();

    // Find all users with SUSPENDED status and expired suspension_expires_at
    const expiredSuspensions = await db
      .select()
      .from(systemUsers)
      .where(
        and(
          eq(systemUsers.status, "SUSPENDED"),
          isNotNull(systemUsers.suspensionExpiresAt),
          lte(systemUsers.suspensionExpiresAt, now)
        )
      );

    if (expiredSuspensions.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No expired suspensions found",
        reactivated: 0,
      });
    }

    // Reactivate all expired suspensions
    const reactivated = await db
      .update(systemUsers)
      .set({
        status: "ACTIVE",
        suspensionExpiresAt: null,
        statusReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(systemUsers.status, "SUSPENDED"),
          isNotNull(systemUsers.suspensionExpiresAt),
          lte(systemUsers.suspensionExpiresAt, now)
        )
      )
      .returning();

    return NextResponse.json({
      success: true,
      message: `Reactivated ${reactivated.length} user(s)`,
      reactivated: reactivated.length,
      users: reactivated.map(u => ({
        id: u.id,
        systemUserId: u.systemUserId,
        fullName: u.fullName,
        email: u.email,
      })),
    });
  } catch (error) {
    console.error("[GET /api/users/auto-reactivate] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
