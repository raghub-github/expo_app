import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { insertTicketActivityAudit } from "@/lib/db/operations/ticket-activity-audit";
import { isInvalidRefreshToken } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

type MergeBody = {
  targetTicketId?: number;
  sourceTicketIds?: number[];
  reason?: string;
};

async function ensureMergeTable(sql: ReturnType<typeof getSql>) {
  await sql`
    CREATE TABLE IF NOT EXISTS public.unified_ticket_merges (
      id BIGSERIAL PRIMARY KEY,
      primary_ticket_id BIGINT NOT NULL REFERENCES public.unified_tickets(id) ON DELETE CASCADE,
      merged_ticket_id BIGINT NOT NULL REFERENCES public.unified_tickets(id) ON DELETE CASCADE,
      merged_by_user_id BIGINT NULL REFERENCES public.system_users(id) ON DELETE SET NULL,
      merged_by_email TEXT NULL,
      reason TEXT NULL,
      merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (primary_ticket_id <> merged_ticket_id)
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS unified_ticket_merges_merged_ticket_id_uidx
    ON public.unified_ticket_merges(merged_ticket_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS unified_ticket_merges_primary_ticket_id_idx
    ON public.unified_ticket_merges(primary_ticket_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS unified_ticket_merges_merged_at_idx
    ON public.unified_ticket_merges(merged_at DESC)
  `;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

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

    const body = (await request.json().catch(() => ({}))) as MergeBody;
    const targetTicketId = Number(body.targetTicketId);
    const requestedSourceIds = Array.isArray(body.sourceTicketIds)
      ? body.sourceTicketIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";

    if (!Number.isFinite(targetTicketId) || targetTicketId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid target ticket" }, { status: 400 });
    }

    const sourceTicketIds = Array.from(new Set(requestedSourceIds.filter((id) => id !== targetTicketId)));
    if (sourceTicketIds.length < 1) {
      return NextResponse.json({ success: false, error: "Select at least 2 tickets and one primary ticket" }, { status: 400 });
    }

    const allIds = [targetTicketId, ...sourceTicketIds];
    const sql = getSql();
    await ensureMergeTable(sql);
    const rows = await sql`
      SELECT id, ticket_id, status, parent_ticket_id
      FROM public.unified_tickets
      WHERE id = ANY(${allIds}::bigint[])
    `;
    if (!Array.isArray(rows) || rows.length !== allIds.length) {
      return NextResponse.json({ success: false, error: "One or more tickets were not found" }, { status: 404 });
    }

    type TicketRow = { id: number; ticket_id: string | null; status: string | null; parent_ticket_id: number | null };
    const byId = new Map<number, TicketRow>();
    for (const row of rows as unknown as TicketRow[]) {
      byId.set(Number(row.id), row);
    }
    const target = byId.get(targetTicketId);
    if (!target) {
      return NextResponse.json({ success: false, error: "Primary ticket not found" }, { status: 404 });
    }

    for (const sourceId of sourceTicketIds) {
      const source = byId.get(sourceId);
      if (!source) {
        return NextResponse.json({ success: false, error: `Ticket ${sourceId} not found` }, { status: 404 });
      }
      if (source.parent_ticket_id != null && Number(source.parent_ticket_id) !== targetTicketId) {
        return NextResponse.json(
          { success: false, error: `Ticket #${source.ticket_id ?? source.id} is already merged into another ticket` },
          { status: 409 }
        );
      }
    }

    const actorName = systemUser.fullName ?? systemUser.email ?? "Agent";
    const actorEmail = systemUser.email ?? null;

    await sql.begin(async (trx) => {
      const run = trx as unknown as typeof sql;

      await run`
        INSERT INTO public.unified_ticket_merges
          (primary_ticket_id, merged_ticket_id, merged_by_user_id, merged_by_email, reason)
        SELECT ${targetTicketId}, s.id, ${systemUser.id}, ${actorEmail}, ${reason || null}
        FROM public.unified_tickets s
        WHERE s.id = ANY(${sourceTicketIds}::bigint[])
        ON CONFLICT (merged_ticket_id) DO UPDATE SET
          primary_ticket_id = EXCLUDED.primary_ticket_id,
          merged_by_user_id = EXCLUDED.merged_by_user_id,
          merged_by_email = EXCLUDED.merged_by_email,
          reason = EXCLUDED.reason,
          merged_at = NOW()
      `;

      await run`
        UPDATE public.unified_tickets
        SET
          parent_ticket_id = ${targetTicketId},
          status = 'CLOSED',
          closed_at = COALESCE(closed_at, NOW()),
          updated_at = NOW(),
          metadata = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(COALESCE(metadata, '{}'::jsonb), '{merged}', 'true'::jsonb, true),
                '{merged_into_ticket_id}',
                to_jsonb(${targetTicketId}::bigint),
                true
              ),
              '{merged_at}',
              to_jsonb(NOW()::text),
              true
            ),
            '{merged_by}',
            to_jsonb(${actorEmail ?? ""}::text),
            true
          )
        WHERE id = ANY(${sourceTicketIds}::bigint[])
      `;

      await run`
        UPDATE public.unified_tickets
        SET
          updated_at = NOW(),
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{merged_ticket_ids}',
            to_jsonb(${sourceTicketIds.map(String)}::text[]),
            true
          )
        WHERE id = ${targetTicketId}
      `;

      const sourceTicketNumbers = sourceTicketIds
        .map((id) => byId.get(id)?.ticket_id || String(id))
        .join(", ");
      const targetTicketNumber = target.ticket_id ?? String(targetTicketId);

      await run`
        INSERT INTO public.unified_ticket_messages
          (ticket_id, message_text, message_type, sender_type, sender_id, sender_name, sender_email, is_internal_note)
        VALUES (
          ${targetTicketId},
          ${`Merged duplicate tickets: ${sourceTicketNumbers}${reason ? ` | Reason: ${reason}` : ""}`},
          'INTERNAL_NOTE',
          'AGENT',
          ${systemUser.id},
          ${actorName},
          ${actorEmail},
          true
        )
      `;

      const auditSql = run as unknown as import("@/lib/db/operations/ticket-activity-audit").TicketAuditSqlClient;
      await insertTicketActivityAudit(auditSql, {
        ticket_id: targetTicketId,
        activity_type: "ticket_merge_target",
        activity_category: "merge",
        activity_description: `Merged tickets into #${targetTicketNumber}: ${sourceTicketNumbers}`,
        actor_user_id: systemUser.id,
        actor_name: actorName,
        actor_email: actorEmail,
        actor_type: "AGENT",
        old_value: null,
        new_value: { merged_ticket_ids: sourceTicketIds, reason: reason || null },
      });

      for (const sourceId of sourceTicketIds) {
        await insertTicketActivityAudit(auditSql, {
          ticket_id: sourceId,
          activity_type: "ticket_merged",
          activity_category: "merge",
          activity_description: `Merged into #${targetTicketNumber}`,
          actor_user_id: systemUser.id,
          actor_name: actorName,
          actor_email: actorEmail,
          actor_type: "AGENT",
          old_value: null,
          new_value: { merged_into_ticket_id: targetTicketId, reason: reason || null },
        });
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        targetTicketId,
        mergedTicketIds: sourceTicketIds,
        mergedCount: sourceTicketIds.length,
      },
    });
  } catch (error) {
    console.error("[POST /api/tickets/merge] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to merge tickets" },
      { status: 500 }
    );
  }
}

