/**
 * GET /api/riders/[id]/blacklist-history
 *
 * Unified, filterable rider blacklist / service-block history for agents:
 *   - blacklist_history         → manual agent blacklist / whitelist actions (+ actor)
 *   - rider_service_block_history → automatic block / unblock transitions, including
 *     cancellation-rate auto-blocks (metadata.source = 'cancellation_rate_auto_block')
 *     and wallet auto-blocks.
 *
 * Filters (query): service (all|food|parcel|person_ride), from, to (YYYY-MM-DD),
 * q (reason/actor search), limit, offset. A specific service also includes "all"-service
 * rows, since an all-services action affects that service too.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

type HistoryRow = {
  at: string;
  service: string;
  action: string; // blacklisted | whitelisted | blocked | unblocked
  kind: "manual" | "auto";
  source: string; // agent | cancellation_rate | wallet | system
  reason: string;
  actor: string | null;
  isPermanent: boolean | null;
  expiresAt: string | null;
};

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email ?? "", "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (isNaN(riderId)) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const sp = request.nextUrl.searchParams;
    const service = (sp.get("service") || "all").toLowerCase();
    const validService = ["food", "parcel", "person_ride"].includes(service) ? service : null;
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const q = (sp.get("q") || "").trim();
    const limit = Math.min(500, Math.max(1, parseInt(sp.get("limit") || "100", 10) || 100));
    const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);

    const from = fromParam ? new Date(fromParam + "T00:00:00.000Z") : null;
    const to = toParam ? new Date(toParam + "T23:59:59.999Z") : null;
    const qLike = q ? `%${q}%` : null;

    const sql = getSql();

    // 1) Manual agent blacklist / whitelist actions.
    const manualRows = (await sql`
      SELECT bh.service_type, bh.reason, bh.banned, bh.is_permanent, bh.expires_at,
             bh.source, bh.created_at, su.email AS actor_email, su.full_name AS actor_name
      FROM blacklist_history bh
      LEFT JOIN system_users su ON su.id = bh.admin_user_id
      WHERE bh.rider_id = ${riderId}
        AND (${validService}::text IS NULL OR bh.service_type = ${validService} OR bh.service_type = 'all')
        AND (${from}::timestamptz IS NULL OR bh.created_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR bh.created_at <= ${to}::timestamptz)
        AND (${qLike}::text IS NULL OR bh.reason ILIKE ${qLike} OR su.email ILIKE ${qLike} OR su.full_name ILIKE ${qLike})
      ORDER BY bh.created_at DESC
      LIMIT 500
    `) as unknown as Array<{
      service_type: string; reason: string; banned: boolean; is_permanent: boolean;
      expires_at: string | Date | null; source: string | null; created_at: string | Date;
      actor_email: string | null; actor_name: string | null;
    }>;

    // 2) Automatic block / unblock transitions (cancellation + wallet + system).
    const autoRows = (await sql`
      SELECT service_type, action, reason, performed_by, metadata, created_at
      FROM rider_service_block_history
      WHERE rider_id = ${riderId}
        AND (${validService}::text IS NULL OR service_type = ${validService} OR service_type = 'all')
        AND (${from}::timestamptz IS NULL OR created_at >= ${from}::timestamptz)
        AND (${to}::timestamptz IS NULL OR created_at <= ${to}::timestamptz)
        AND (${qLike}::text IS NULL OR reason ILIKE ${qLike} OR performed_by ILIKE ${qLike})
      ORDER BY created_at DESC
      LIMIT 500
    `) as unknown as Array<{
      service_type: string; action: string; reason: string; performed_by: string | null;
      metadata: Record<string, unknown> | null; created_at: string | Date;
    }>;

    const manual: HistoryRow[] = manualRows.map((r) => ({
      at: toIso(r.created_at),
      service: r.service_type || "all",
      action: r.banned ? "blacklisted" : "whitelisted",
      kind: "manual",
      source: r.source ?? "agent",
      reason: r.reason,
      actor: r.actor_email ?? r.actor_name ?? null,
      isPermanent: r.is_permanent,
      expiresAt: r.expires_at ? toIso(r.expires_at) : null,
    }));

    const auto: HistoryRow[] = autoRows.map((r) => {
      const m = r.metadata ?? {};
      const rawSource = typeof m.source === "string" ? m.source : "";
      const source =
        rawSource === "cancellation_rate_auto_block"
          ? "cancellation_rate"
          : rawSource.includes("wallet")
            ? "wallet"
            : "system";
      let reason = r.reason;
      if (source === "cancellation_rate" && m.riderFault != null && m.accepted != null) {
        reason = `Rider-fault ${m.riderFault}/${m.accepted} = ${m.riderFaultRate}% vs ${m.thresholdPct}% (slab ${m.slab ?? "?"})`;
      }
      return {
        at: toIso(r.created_at),
        service: r.service_type || "all",
        action: r.action, // blocked | unblocked
        kind: "auto",
        source,
        reason,
        actor: r.performed_by ?? "system",
        isPermanent: null,
        expiresAt: null,
      };
    });

    const all = [...manual, ...auto].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
    const total = all.length;
    const rows = all.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: { rows, total, service, from: fromParam, to: toParam, q },
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/blacklist-history] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
