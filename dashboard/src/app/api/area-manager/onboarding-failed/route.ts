/**
 * GET /api/area-manager/onboarding-failed
 * Child stores with open verification-step rejections (AM can Fix / resubmit).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAreaManagerApiAuth();
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const areaManagerId = authResult.resolved.isSuperAdmin
      ? null
      : authResult.resolved.areaManager.id > 0
        ? authResult.resolved.areaManager.id
        : null;

    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || "50"), 1), 100);
    const countOnly = request.nextUrl.searchParams.get("countOnly") === "1";

    const sql = getSql();

    const amClause =
      areaManagerId != null
        ? sql`AND (ms.area_manager_id = ${areaManagerId} OR ms.area_manager_id IS NULL)`
        : sql``;

    const countRows = await sql`
      SELECT COUNT(DISTINCT ms.id)::int AS cnt
      FROM merchant_stores ms
      INNER JOIN store_verification_step_rejections r
        ON r.store_id = ms.id
      WHERE ms.deleted_at IS NULL
      ${amClause}
    `;
    const countRow = Array.isArray(countRows) ? countRows[0] : countRows;
    const count = Number((countRow as { cnt?: number } | null)?.cnt ?? 0);
    const safeCount = Number.isFinite(count) ? count : 0;

    if (countOnly) {
      return NextResponse.json({
        success: true,
        count: safeCount,
        items: [],
      });
    }

    const rows = await sql`
      SELECT
        ms.id,
        ms.store_id,
        COALESCE(ms.store_display_name, ms.store_name) AS name,
        ms.parent_id,
        ms.approval_status,
        ms.city,
        MIN(r.step_number) AS min_step,
        COUNT(*)::int AS open_step_count,
        MAX(r.rejected_at) AS latest_rejected_at
      FROM merchant_stores ms
      INNER JOIN store_verification_step_rejections r
        ON r.store_id = ms.id
      WHERE ms.deleted_at IS NULL
      ${amClause}
      GROUP BY ms.id, ms.store_id, ms.store_display_name, ms.store_name, ms.parent_id, ms.approval_status, ms.city
      ORDER BY MAX(r.rejected_at) DESC NULLS LAST, ms.id DESC
      LIMIT ${limit}
    `;

    const list = (Array.isArray(rows) ? rows : rows ? [rows] : []) as Array<{
      id: number;
      store_id: string;
      name: string;
      parent_id: number | null;
      approval_status: string;
      city: string | null;
      min_step: number;
      open_step_count: number;
      latest_rejected_at: string | Date | null;
    }>;

    /** Rejected step numbers still open per store. */
    const rejectedStepsByStore = new Map<number, Set<number>>();
    /** Steps that already have pending resubmission rows. */
    const pendingStepsByStore = new Map<number, Set<number>>();

    const storeIds = list.map((r) => Number(r.id)).filter((id) => Number.isFinite(id) && id > 0);
    if (storeIds.length > 0) {
      try {
        const sqlUnsafe = getSql() as {
          unsafe: (q: string, v?: unknown[]) => Promise<unknown[]>;
        };
        const inList = storeIds.join(",");
        const stepRows = (await sqlUnsafe.unsafe(
          `
          SELECT store_id, step_number
          FROM store_verification_step_rejections
          WHERE store_id IN (${inList})
          `
        )) as { store_id: number; step_number: number }[];
        for (const row of stepRows || []) {
          const sid = Number(row.store_id);
          const step = Number(row.step_number);
          if (!Number.isFinite(sid) || !Number.isFinite(step)) continue;
          if (!rejectedStepsByStore.has(sid)) rejectedStepsByStore.set(sid, new Set());
          rejectedStepsByStore.get(sid)!.add(step);
        }

        const pendingRows = (await sqlUnsafe.unsafe(
          `
          SELECT DISTINCT store_id, verification_step
          FROM merchant_store_onboarding_resubmissions
          WHERE store_id IN (${inList})
            AND status = 'pending'
          `
        )) as { store_id: number; verification_step: number }[];
        for (const row of pendingRows || []) {
          const sid = Number(row.store_id);
          const step = Number(row.verification_step);
          if (!Number.isFinite(sid) || !Number.isFinite(step)) continue;
          if (!pendingStepsByStore.has(sid)) pendingStepsByStore.set(sid, new Set());
          pendingStepsByStore.get(sid)!.add(step);
        }
      } catch (e) {
        console.warn("[GET /api/area-manager/onboarding-failed] pending coverage lookup failed:", e);
      }
    }

    const items = list.map((r) => {
      const id = Number(r.id);
      const rejectedSteps = rejectedStepsByStore.get(id) ?? new Set<number>();
      const pendingSteps = pendingStepsByStore.get(id) ?? new Set<number>();
      const resubmitted =
        rejectedSteps.size > 0 && [...rejectedSteps].every((step) => pendingSteps.has(step));

      return {
        id,
        storeId: String(r.store_id),
        name: String(r.name || r.store_id),
        parentId: r.parent_id != null ? Number(r.parent_id) : null,
        status: String(r.approval_status || ""),
        city: r.city ?? null,
        openVerificationFixStep: Number(r.min_step) || 4,
        openStepCount: Number(r.open_step_count) || 1,
        resubmitted,
        latestRejectedAt:
          r.latest_rejected_at instanceof Date
            ? r.latest_rejected_at.toISOString()
            : r.latest_rejected_at
              ? String(r.latest_rejected_at)
              : null,
      };
    });

    return NextResponse.json({
      success: true,
      count: safeCount,
      items,
    });
  } catch (e) {
    console.error("[GET /api/area-manager/onboarding-failed]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
