/**
 * POST /api/tickets/automation/process-jobs
 * Drain pending ticket_automation_jobs (workflow + assignment pipeline).
 *
 * Auth (either):
 * - Signed-in dashboard user with TICKET access (cookie session), or
 * - Header Authorization: Bearer <TICKETS_AUTOMATION_WORKER_SECRET> when env is set (cron / worker).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { processPendingAutomationJobs } from "@/lib/tickets/ticket-automation/job-processor";

export const runtime = "nodejs";
/** Prevent overlapping browser polls from holding connections for minutes. */
export const maxDuration = 25;

async function requireTicketManager(request: NextRequest) {
  const auth = await getAuthenticatedApiUser(request);
  if (!auth.ok) return { error: authFailureResponse(auth) };

  const systemUser = await getSystemUserByEmail(auth.user.email!);
  if (!systemUser) {
    return { error: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }) };
  }
  const userIsSuperAdmin = await isSuperAdmin(auth.user.id, auth.user.email!);
  const hasTicketAccess = await hasDashboardAccessByAuth(auth.user.id, auth.user.email!, "TICKET");
  if (!userIsSuperAdmin && !hasTicketAccess) {
    return { error: NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 }) };
  }
  return { systemUser };
}

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.TICKETS_AUTOMATION_WORKER_SECRET?.trim();
  if (!secret) return false;
  const h = request.headers.get("authorization")?.trim() ?? "";
  return h === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  let limit = 25;
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
    const raw = Number(body?.limit);
    if (Number.isFinite(raw)) limit = Math.min(50, Math.max(1, raw));
  } catch {
    limit = 25;
  }

  if (!authorizeCron(request)) {
    const auth = await requireTicketManager(request);
    if ("error" in auth && auth.error) return auth.error;
  }

  try {
    const sql = getSql();
    const out = await processPendingAutomationJobs(sql, {
      limit,
      workerId: "api-process-jobs",
    });
    return NextResponse.json({
      success: true,
      data: { processed: out.processed, jobErrors: out.jobErrors },
    });
  } catch (e) {
    console.error("[POST /api/tickets/automation/process-jobs]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
