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

export const runtime = "nodejs";

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "rejected", label: "Rejected" },
  { value: "reopened", label: "Reopened" },
  { value: "pending", label: "Pending" },
  { value: "open_frt", label: "Open FRT" },
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
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const systemUser = await getSystemUserByEmail(session.user.email!);
    if (!systemUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const userIsSuperAdmin = await isSuperAdmin(session.user.id, session.user.email!);
    const hasTicketAccess = await hasDashboardAccessByAuth(
      session.user.id,
      session.user.email!,
      "TICKET"
    );

    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
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
      groups = (groupRows || []).map((r: { id: bigint; group_code: string; group_name: string }) => ({
        id: Number(r.id),
        groupCode: r.group_code ?? "",
        groupName: r.group_name ?? "",
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
      tags = (tagRows || []).map((r: { id: bigint; tag_code: string; tag_name: string }) => ({
        id: Number(r.id),
        tagCode: r.tag_code ?? "",
        tagName: r.tag_name ?? "",
      }));
    } catch {
      tags = [];
    }

    return NextResponse.json({
      success: true,
      data: {
        groups,
        tags,
        statuses: STATUS_OPTIONS,
        services: SERVICE_OPTIONS,
        priorities: PRIORITY_OPTIONS,
        sources: SOURCE_OPTIONS,
      },
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
