/**
 * GET /api/area-manager/stores/export - CSV export (same filters as list)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { listMerchantStores } from "@/lib/db/operations/merchant-stores";
import { checkExportRateLimit } from "@/lib/rate-limit";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

const MAX_EXPORT = 5000;

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const getAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    };
    const authResult = await requireAreaManagerApiAuth(getAuthUser);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const { resolved } = authResult;
    const rate = checkExportRateLimit(resolved.systemUserId);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many export requests. Try again later.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: rate.retryAfterMs
            ? { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) }
            : undefined,
        }
      );
    }
    const areaManagerId = resolved.isSuperAdmin ? null : resolved.areaManager.id;

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") as "VERIFIED" | "PENDING" | "REJECTED" | undefined;
    const search = searchParams.get("search") ?? undefined;
    const approval_status =
      status === "VERIFIED"
        ? "APPROVED"
        : status === "PENDING"
          ? "SUBMITTED"
          : status === "REJECTED"
            ? "REJECTED"
            : undefined;

    const { items } = await listMerchantStores({
      areaManagerId,
      limit: MAX_EXPORT,
      cursor: undefined,
      approval_status,
      search,
    });

    const headers = [
      "id",
      "storeId",
      "name",
      "status",
      "approval_status",
      "city",
      "parentId",
      "createdAt",
    ];
    const rows = items.map((s) =>
      [
        s.id,
        s.store_id,
        s.store_display_name ?? s.store_name,
        s.status,
        s.approval_status,
        s.city ?? "",
        s.parent_id ?? "",
        s.created_at instanceof Date ? s.created_at.toISOString() : String(s.created_at),
      ].map(escapeCsv)
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="stores-export-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/stores/export]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
