/**
 * Customer Management API Routes
 * GET /api/customers - List customers with filters and pagination
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCustomers, getCustomerByCustomerId } from "@/lib/db/operations/customers";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { logAPICall } from "@/lib/auth/activity-tracker";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { getRedisClient } from "@/lib/redis";
import { getCached, setCached } from "@/lib/server-cache";

export const runtime = 'nodejs';

/**
 * GET /api/customers
 * List customers with filters and pagination
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

    // Check if user is super admin or has CUSTOMER dashboard access (in parallel)
    const [userIsSuperAdmin, hasDashboardAccess] = await Promise.all([
      isSuperAdmin(user.id, user.email ?? ""),
      hasDashboardAccessByAuth(user.id, user.email ?? "", "CUSTOMER"),
    ]);

    if (!userIsSuperAdmin && !hasDashboardAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. You need access to the Customer dashboard." },
        { status: 403 }
      );
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const filters = {
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "20"),
      search: searchParams.get("search") || undefined,
      status: searchParams.get("status") || undefined,
      orderType: searchParams.get("orderType") as "food" | "parcel" | "person_ride" | undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      sortBy: searchParams.get("sortBy") || undefined,
      sortOrder: (searchParams.get("sortOrder") || "desc") as "asc" | "desc",
    };

    // Get system user ID
    const systemUser = await getSystemUserByEmail(user.email ?? "");
    if (!systemUser) {
      return NextResponse.json(
        { success: false, error: "User not found in system" },
        { status: 404 }
      );
    }

    // Server-side cache (per user + filters) for 30s to offload DB on repeated queries
    const redis = getRedisClient();
    const cacheKey = systemUser ? `customers:${systemUser.id}:${JSON.stringify(filters)}` : null;

    const MEMORY_TTL_MS = 10_000; // 10s in-memory fallback
    if (cacheKey) {
      const cached = getCached<{ customers: unknown[]; pagination: unknown }>(cacheKey);
      if (cached) {
        return NextResponse.json({
          success: true,
          data: cached.customers,
          pagination: cached.pagination,
        });
      }
    }

    if (redis && cacheKey) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            customers: unknown[];
            pagination: unknown;
          };
          // Populate memory cache too for immediate follow-up navigations.
          setCached(cacheKey, parsed, MEMORY_TTL_MS);
          return NextResponse.json({
            success: true,
            data: parsed.customers,
            pagination: parsed.pagination,
          });
        }
      } catch {
        // ignore cache read errors
      }
    }

    // Fetch customers
    const result = await listCustomers(filters);

    // Log activity
    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined;
    await logAPICall(
      systemUser.id,
      "/api/customers",
      "GET",
      true,
      filters,
      { count: result.customers.length },
      ipAddress
    );

    const toCache = {
      customers: result.customers,
      pagination: result.pagination,
    };

    if (cacheKey) {
      setCached(cacheKey, toCache, MEMORY_TTL_MS);
    }

    if (redis && cacheKey) {
      try {
        await redis.set(cacheKey, JSON.stringify(toCache), "EX", 30);
      } catch {
        // ignore cache write errors
      }
    }

    return NextResponse.json({
      success: true,
      data: result.customers,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[GET /api/customers] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
