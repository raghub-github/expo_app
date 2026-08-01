import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  resolveNotificationStoreId,
  resolveNotificationUserId,
} from "@/lib/notifications/resolve-target";

export const runtime = "nodejs";

function splitCsv(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const storeId = req.nextUrl.searchParams.get("store_id")?.trim() ?? "";
  const storeIds = req.nextUrl.searchParams.get("store_ids")?.trim() ?? "";
  const userId = req.nextUrl.searchParams.get("user_id")?.trim() ?? "";
  const userIds = req.nextUrl.searchParams.get("user_ids")?.trim() ?? "";

  const modes = [storeId, storeIds, userId, userIds].filter(Boolean).length;
  if (modes === 0) {
    return NextResponse.json(
      { error: "store_id_or_user_id_required" },
      { status: 400 },
    );
  }
  if (modes > 1) {
    return NextResponse.json(
      { error: "provide_one_of_store_id_store_ids_user_id_user_ids" },
      { status: 400 },
    );
  }

  try {
    if (storeIds) {
      const tokens = splitCsv(storeIds);
      const resolved = [];
      const missing: string[] = [];
      for (const token of tokens) {
        const hit = await resolveNotificationStoreId(token);
        if (hit) resolved.push(hit);
        else missing.push(token);
      }
      return NextResponse.json({
        found: resolved.length > 0,
        resolved,
        missing,
        count: resolved.length,
      });
    }

    if (storeId) {
      const resolved = await resolveNotificationStoreId(storeId);
      if (!resolved) {
        return NextResponse.json({ found: false, error: "store_not_found" }, { status: 404 });
      }
      return NextResponse.json({ found: true, resolved });
    }

    if (userIds) {
      const tokens = splitCsv(userIds);
      const resolved = [];
      const missing: string[] = [];
      for (const token of tokens) {
        const hit = await resolveNotificationUserId(token);
        if (hit) resolved.push(hit);
        else missing.push(token);
      }
      return NextResponse.json({
        found: resolved.length > 0,
        resolved,
        missing,
        count: resolved.length,
      });
    }

    const resolved = await resolveNotificationUserId(userId);
    if (!resolved) {
      return NextResponse.json({ found: false, error: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json({ found: true, resolved });
  } catch (err) {
    console.error("[GET /api/super-admin/notifications/resolve-target]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "lookup_failed" },
      { status: 500 },
    );
  }
}
