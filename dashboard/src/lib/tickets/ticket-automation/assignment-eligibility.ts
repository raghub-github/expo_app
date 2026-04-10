import type { getSql } from "@/lib/db/client";

type SqlClient = ReturnType<typeof getSql>;

/** Statuses where auto-assignment must not run. */
export const TERMINAL_ASSIGN_STATUSES = [
  "CLOSED",
  "RESOLVED",
  "REJECTED",
  "CANCELLED",
  "PROVISIONALLY_RESOLVED",
] as const;

function normStatus(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_");
}

export type AssignmentGateResult = { ok: true } | { ok: false; code: string; detail: string };

/**
 * Live check before auto-assign (spam, terminal status).
 */
export async function getTicketAutoAssignmentGate(
  sql: SqlClient,
  ticketId: number
): Promise<AssignmentGateResult> {
  const rows = (await sql`
    SELECT status::text AS st,
           COALESCE(is_spam, false) AS is_spam
    FROM public.unified_tickets
    WHERE id = ${ticketId}
    LIMIT 1
  `) as { st?: string; is_spam?: boolean }[];
  const r = rows[0];
  if (!r) return { ok: false, code: "NOT_FOUND", detail: "ticket not found" };
  if (r.is_spam === true) {
    return { ok: false, code: "SPAM", detail: "ticket marked spam" };
  }
  const st = normStatus(r.st);
  if ((TERMINAL_ASSIGN_STATUSES as readonly string[]).includes(st)) {
    return { ok: false, code: "TERMINAL_STATUS", detail: `status ${st}` };
  }
  return { ok: true };
}
