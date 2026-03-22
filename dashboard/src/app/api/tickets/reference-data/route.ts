/**
 * GET /api/tickets/reference-data
 * Returns groups (from ticket_groups), tags (from ticket_tags), and static options
 * for status, service, priority, source for use in filters and super-admin.
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";
import { getCached, setCached, CACHE_KEYS } from "@/lib/server-cache";

export const runtime = "nodejs";

const REF_CACHE_TTL_MS = 60_000; // 60s

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "open_frt", label: "Mark FRT" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "rejected", label: "Rejected" },
  { value: "reopened", label: "Reopened" },
  { value: "pending", label: "Pending" },
  { value: "waiting_for_user", label: "Waiting for User" },
  { value: "provisionally_resolved", label: "Provisionally Resolved" },
];

const SERVICE_OPTIONS = [
  { value: "food", label: "Food" },
  { value: "parcel", label: "Parcel" },
  { value: "person_ride", label: "Person Ride" },
  { value: "other", label: "Other" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
  { value: "critical", label: "Critical" },
];

const SOURCE_OPTIONS = [
  { value: "customer", label: "Customer" },
  { value: "rider", label: "Rider" },
  { value: "merchant", label: "Merchant" },
  { value: "system", label: "System" },
];

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 });
      }
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(user.id, user.email!, "TICKET");

    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const cached = getCached<{ groups: unknown[]; tags: unknown[] }>(CACHE_KEYS.TICKETS_REFERENCE_DATA);
    if (cached) {
      return NextResponse.json({
        success: true,
        data: {
          ...cached,
          statuses: STATUS_OPTIONS,
          services: SERVICE_OPTIONS,
          priorities: PRIORITY_OPTIONS,
          sources: SOURCE_OPTIONS,
        },
      });
    }

    const sql = getSql();
    let groups: Array<{ id: number; groupCode: string; groupName: string }> = [];
    let tags: Array<{ id: number; tagCode: string; tagName: string }> = [];

    try {
      const groupRows = await sql`
        SELECT id, group_code, group_name
        FROM ticket_groups
        WHERE is_active = true
        ORDER BY display_order ASC NULLS LAST, group_name ASC
      `;
      groups = (groupRows || []).map((r: Record<string, unknown>) => ({
        id: Number(r.id),
        groupCode: String(r.group_code ?? r.groupCode ?? ""),
        groupName: String(r.group_name ?? r.groupName ?? r.group_code ?? r.groupCode ?? ""),
      }));
    } catch {
      groups = [];
    }

    try {
      const tagRows = await sql`
        SELECT id, tag_code, tag_name
        FROM ticket_tags
        WHERE is_active = true
        ORDER BY tag_name ASC
      `;
      tags = ((tagRows || []) as unknown as { id: bigint; tag_code: string; tag_name: string }[]).map((r) => ({
        id: Number(r.id),
        tagCode: r.tag_code ?? "",
        tagName: r.tag_name ?? "",
      }));    } catch {
      tags = [];
    }

    const payload = { groups, tags, statuses: STATUS_OPTIONS, services: SERVICE_OPTIONS, priorities: PRIORITY_OPTIONS, sources: SOURCE_OPTIONS };
    setCached(CACHE_KEYS.TICKETS_REFERENCE_DATA, { groups, tags }, REF_CACHE_TTL_MS);

    return NextResponse.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    console.error("[GET /api/tickets/reference-data] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
