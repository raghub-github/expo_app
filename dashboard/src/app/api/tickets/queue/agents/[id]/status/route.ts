/**
 * PATCH /api/tickets/queue/agents/[id]/status
 * Super admin: set another agent to offline (supervisor “mark logout”).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { headers } from "next/headers";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { applySupervisorAgentOffline } from "@/lib/agents/apply-supervisor-agent-offline";
import { runQueueBalanceAutoAssign } from "@/lib/tickets/queue-balance-auto-assign";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idParam } = await params;
    const targetUserId = Number(idParam);
    if (!Number.isFinite(targetUserId)) {
      return NextResponse.json({ success: false, error: "Invalid agent id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const allowed = await isSuperAdmin(user.id, user.email);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Super admin only" }, { status: 403 });
    }

    const body = (await request.json()) as { status?: string; reason?: string };
    if (body.status !== "offline") {
      return NextResponse.json({ success: false, error: "Only status offline is supported" }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) {
      return NextResponse.json({ success: false, error: "Offline reason is required" }, { status: 400 });
    }
    if (reason.length > 500) {
      return NextResponse.json({ success: false, error: "Reason is too long" }, { status: 400 });
    }

    const sql = getSql();
    const headersList = await headers();
    const ipAddress = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "unknown";
    const userAgent = headersList.get("user-agent") || "unknown";

    const supervisorSu = await getSystemUserByEmail(user.email);
    if (!supervisorSu) {
      return NextResponse.json({ success: false, error: "Supervisor user not found" }, { status: 404 });
    }

    await applySupervisorAgentOffline(sql, {
      targetUserId,
      supervisorUserId: supervisorSu.id,
      ipAddress,
      userAgent,
      offlineReason: reason,
    });

    try {
      await runQueueBalanceAutoAssign(sql, {
        forAgentUserId: targetUserId,
        excludeAgentUserIds: [targetUserId],
      });
    } catch (e) {
      console.error("[PATCH queue/agents/status] auto-assign after supervisor offline:", e);
    }

    try {
      const { getTicketQueueOfflineReleaseSettings } = await import(
        "@/lib/tickets/ticket-queue-offline-settings"
      );
      const { enqueueTicketAutomationJob } = await import(
        "@/lib/tickets/ticket-automation/enqueue-automation-job"
      );
      const { processPendingAutomationJobs } = await import(
        "@/lib/tickets/ticket-automation/job-processor"
      );
      const offlineSettings = await getTicketQueueOfflineReleaseSettings(sql);
      if (offlineSettings.releaseWhenAgentOffline) {
        await enqueueTicketAutomationJob(sql, {
          ticketId: null,
          agentUserId: targetUserId,
          triggerEvent: "agent_went_offline",
          idempotencyKey: `supervisor-offline:${targetUserId}:${Math.floor(Date.now() / 1000)}`,
        });
        await processPendingAutomationJobs(sql, {
          limit: 20,
          workerId: `supervisor-offline-${targetUserId}`,
        });
      }
    } catch (autoErr) {
      console.error("[PATCH queue/agents/status] offline automation:", autoErr);
    }

    return NextResponse.json({ success: true, data: { status: "offline" } });
  } catch (e) {
    console.error("[PATCH /api/tickets/queue/agents/[id]/status]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed to update agent" },
      { status: 500 }
    );
  }
}
