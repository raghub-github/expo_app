/**
 * POST /api/admin/parent-area-managers
 *   Body: { parentId: number; areaManagerIds: number[] }
 *   Assign one or more Area Managers to a parent merchant.
 *
 * DELETE /api/admin/parent-area-managers
 *   Body: { parentId: number; areaManagerId: number }
 *   Remove a specific Area Manager assignment.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth, getSystemUserIdFromAuthUser } from "@/lib/permissions/engine";
import {
  assignAreaManagersToParent,
  countDistinctAssignedAreaManagersForParent,
  listAssignedAreaManagers,
  removeAreaManagerAssignment,
} from "@/lib/db/operations/parent-area-managers";

export const runtime = "nodejs";

async function assertAdminOrSuperAdmin(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return { ok: false as const, status: 401, error: "Not authenticated", user: null as any, systemUserId: null as any };
  }

  const superAdmin = await isSuperAdmin(user.id, user.email);
  const hasMerchantAccess = await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT");
  if (!superAdmin && !hasMerchantAccess) {
    return { ok: false as const, status: 403, error: "Admin or Super Admin access required", user: null as any, systemUserId: null as any };
  }

  const systemUserId = await getSystemUserIdFromAuthUser(user.id, user.email);
  return { ok: true as const, user, systemUserId };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await assertAdminOrSuperAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const parentIdParam = request.nextUrl.searchParams.get("parentId");
    const storeInternalParam = request.nextUrl.searchParams.get("storeInternalId");
    const parentId = parentIdParam != null ? Number(parentIdParam) : null;
    const storeInternalId =
      storeInternalParam != null && storeInternalParam !== ""
        ? Number(storeInternalParam)
        : null;
    if (!parentId || !Number.isFinite(parentId)) {
      return NextResponse.json({ success: false, error: "parentId is required" }, { status: 400 });
    }

    const items = await listAssignedAreaManagers(parentId, storeInternalId);
    const parentDistinctAmCount = await countDistinctAssignedAreaManagersForParent(parentId);
    return NextResponse.json({ success: true, items, count: items.length, parentAssignedAmsCount: parentDistinctAmCount });
  } catch (e) {
    console.error("[GET /api/admin/parent-area-managers]", e);
    return NextResponse.json({ success: false, error: "Failed to load assigned area managers" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertAdminOrSuperAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const parentId = body.parentId != null ? Number(body.parentId) : null;
    const areaManagerIds = Array.isArray(body.areaManagerIds)
      ? body.areaManagerIds.map((id: unknown) => Number(id)).filter((n: number) => Number.isFinite(n))
      : [];
    const storeInternalId =
      body.storeInternalId != null && body.storeInternalId !== ""
        ? Number(body.storeInternalId)
        : null;
    if (!parentId || !Number.isFinite(parentId)) {
      return NextResponse.json({ success: false, error: "parentId is required" }, { status: 400 });
    }
    if (!areaManagerIds.length) {
      return NextResponse.json({ success: false, error: "areaManagerIds is required" }, { status: 400 });
    }

    await assignAreaManagersToParent({
      parentId,
      areaManagerIds,
      assignedBy: auth.systemUserId ?? null,
      storeInternalId,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[POST /api/admin/parent-area-managers]", e);
    return NextResponse.json({ success: false, error: "Failed to assign area managers" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await assertAdminOrSuperAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const parentId = body.parentId != null ? Number(body.parentId) : null;
    const areaManagerId = body.areaManagerId != null ? Number(body.areaManagerId) : null;
    const storeInternalId =
      body.storeInternalId != null && body.storeInternalId !== ""
        ? Number(body.storeInternalId)
        : null;
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? (body.reason as string).trim()
        : null;

    if (!parentId || !Number.isFinite(parentId) || !areaManagerId || !Number.isFinite(areaManagerId)) {
      return NextResponse.json({ success: false, error: "parentId and areaManagerId are required" }, { status: 400 });
    }

    await removeAreaManagerAssignment({
      parentId,
      areaManagerId,
      storeInternalId,
      removedBy: auth.systemUserId ?? null,
      reason,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/admin/parent-area-managers]", e);
    return NextResponse.json({ success: false, error: "Failed to remove assignment" }, { status: 500 });
  }
}

