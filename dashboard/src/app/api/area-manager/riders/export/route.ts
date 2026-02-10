/**
 * GET /api/area-manager/riders/export - CSV export (same filters as list)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireRiderManager } from "@/lib/area-manager/auth";
import { listRidersByAreaManager } from "@/lib/area-manager/queries";
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
    const err = requireRiderManager(authResult.resolved);
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
    const status = searchParams.get("status") as "ACTIVE" | "INACTIVE" | "BLOCKED" | undefined;
    const localityCode = searchParams.get("localityCode") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const { items } = await listRidersByAreaManager({
      areaManagerId,
      status,
      localityCode,
      search,
      limit: MAX_EXPORT,
      cursor: undefined,
    });

    const headers = [
      "id",
      "mobile",
      "name",
      "status",
      "localityCode",
      "availabilityStatus",
      "createdAt",
    ];
    const rows = items.map((r) =>
      [
        r.id,
        r.mobile,
        r.name ?? "",
        r.status,
        r.localityCode ?? "",
        r.availabilityStatus,
        r.createdAt?.toISOString() ?? "",
      ].map(escapeCsv)
    );
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="riders-export-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/area-manager/riders/export]", error);
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
