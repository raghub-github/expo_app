/**
 * POST /api/tickets/bulk-update
 *
 * Applies one set of changes (status / priority / group / assignee / tags /
 * spam) to many tickets in a single request.
 *
 * Replaces the previous client-side fan-out, which fired one PATCH per selected
 * ticket in parallel. Each of those PATCHes ran the workflow engine inline —
 * including a `sql.begin()` queue-balance transaction — so selecting four
 * tickets opened four concurrent transactions plus four job-processor loops on
 * the same small connection pool. The list refresh queued behind them and the
 * browser aborted it ("Failed to refresh tickets — request timed out").
 *
 * Here the tickets are processed one at a time on a single connection, and
 * automation is enqueued rather than executed, so the request returns promptly
 * and the rules run afterwards from `POST /api/tickets/automation/process-jobs`.
 *
 * Manual intent wins: every field named in the request is stamped as a manual
 * override on each ticket, so `ticket_updated` rules, the default-routing-group
 * fallback and queue auto-balance leave those fields alone. Tickets that were
 * not touched keep following the normal group-assignment and priority rules.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";
import {
  applyTicketUpdate,
  newBatchId,
  type TicketUpdateBody,
} from "@/lib/tickets/apply-ticket-update";
import { insertTicketActivityAudit } from "@/lib/db/operations/ticket-activity-audit";

export const runtime = "nodejs";

/** Hard ceiling so one request cannot monopolise a connection. */
const MAX_TICKETS_PER_REQUEST = 200;

type BulkResult = {
  ticketId: number;
  ok: boolean;
  error?: string;
  code?: string;
  changedFields?: string[];
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError) {
      if (isInvalidRefreshToken(userError)) {
        await signOutIfSessionDead(supabase, userError);
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
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

    const [userIsSuperAdmin, hasTicketAccess] = await Promise.all([
      isSuperAdmin(user.id, user.email!),
      hasDashboardAccessByAuth(user.id, user.email!, "TICKET"),
    ]);
    if (!userIsSuperAdmin && !hasTicketAccess) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const payload = (await request.json()) as {
      ticketIds?: unknown;
      updates?: Record<string, unknown>;
    };

    const ticketIds = Array.isArray(payload.ticketIds)
      ? [
          ...new Set(
            payload.ticketIds
              .map((id) => (typeof id === "number" ? id : Number(id)))
              .filter((id) => Number.isFinite(id) && id > 0)
          ),
        ]
      : [];

    if (ticketIds.length === 0) {
      return NextResponse.json({ success: false, error: "No tickets selected" }, { status: 400 });
    }
    if (ticketIds.length > MAX_TICKETS_PER_REQUEST) {
      return NextResponse.json(
        {
          success: false,
          error: `Select at most ${MAX_TICKETS_PER_REQUEST} tickets per bulk update`,
        },
        { status: 400 }
      );
    }

    /**
     * Whitelist: only fields the bulk UI offers. Anything absent is left alone
     * on every selected ticket (that is what "— No change —" means).
     */
    const raw = payload.updates ?? {};
    const updates: TicketUpdateBody = {};
    if (raw.status !== undefined && String(raw.status).trim() !== "") updates.status = raw.status;
    if (raw.priority !== undefined && String(raw.priority).trim() !== "") updates.priority = raw.priority;
    if (raw.groupId !== undefined) updates.groupId = raw.groupId;
    if (raw.currentAssigneeUserId !== undefined) updates.currentAssigneeUserId = raw.currentAssigneeUserId;
    if (raw.isSpam !== undefined) updates.isSpam = raw.isSpam;
    if (raw.tags !== undefined && Array.isArray(raw.tags)) updates.tags = raw.tags;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    const sqlClient = getSql();
    const batchId = newBatchId();
    const actor = {
      id: systemUser.id,
      name: systemUser.fullName ?? systemUser.email ?? "Agent",
      email: systemUser.email ?? null,
    };

    /**
     * Serial on purpose. Parallelising here is what starved the pool; a bulk of
     * 200 still finishes well inside the request budget because the heavy work
     * (rule evaluation, queue balance) is queued, not inline.
     */
    const results: BulkResult[] = [];
    for (const ticketId of ticketIds) {
      try {
        const outcome = await applyTicketUpdate(sqlClient, ticketId, { ...updates }, actor, {
          batchId,
          source: "manual_bulk",
        });
        results.push(
          outcome.ok
            ? { ticketId, ok: true, changedFields: outcome.changedFields }
            : { ticketId, ok: false, error: outcome.error, code: outcome.code }
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[POST /api/tickets/bulk-update] ticket ${ticketId}:`, e);
        results.push({ ticketId, ok: false, error: message });
      }
    }

    const updatedCount = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);

    /**
     * One summary row so the batch itself is auditable, not just the per-ticket
     * rows. Attached to the first successfully updated ticket; skipped when the
     * whole batch failed (no ticket to hang it off).
     */
    const anchorTicketId = results.find((r) => r.ok)?.ticketId;
    if (anchorTicketId != null) {
      await insertTicketActivityAudit(
        sqlClient as unknown as import("@/lib/db/operations/ticket-activity-audit").TicketAuditSqlClient,
        {
          ticket_id: anchorTicketId,
          activity_type: "bulk_update",
          activity_category: "bulk_action",
          activity_description: `Bulk update applied to ${updatedCount} of ${ticketIds.length} tickets`,
          actor_user_id: actor.id,
          actor_name: actor.name,
          actor_email: actor.email,
          actor_type: "AGENT",
          batch_id: batchId,
          update_source: "manual_bulk",
          is_manual_override: true,
          changed_fields: Object.keys(updates),
          old_value: { ticket_ids: ticketIds },
          new_value: { updates, updated: updatedCount, failed: failed.length },
        }
      );
    }

    return NextResponse.json({
      success: updatedCount > 0,
      data: {
        batchId,
        requested: ticketIds.length,
        updated: updatedCount,
        failed: failed.length,
        results,
      },
      ...(updatedCount === 0
        ? { error: failed[0]?.error ?? "No tickets were updated" }
        : {}),
    });
  } catch (error) {
    console.error("[POST /api/tickets/bulk-update] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
