import "server-only";
import { getSql } from "@/lib/db/client";

/** Row shape sent to the queue UI. Comes from JOIN of manual_reviews + requests. */
export type QueueRow = {
  review_id: number;
  request_id: number;
  reason: string;
  state: "queued" | "in_review" | "resolved" | "escalated" | "expired";
  assigned_to: number | null;
  created_at: string;
  verification_id: string;
  document_kind: string;
  subject_type: string;
  subject_id: number;
  status: string;
  status_reason: string | null;
  confidence: string | null;
  business_identifier: string | null;
  verified_data: unknown;
  provider: string;
  provider_reference: string | null;
};

export async function listQueue(subjectType: string, includeResolved = false): Promise<QueueRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT m.id AS review_id, m.request_id, m.reason, m.state::text, m.assigned_to, m.created_at,
           r.verification_id, r.document_kind::text, r.subject_type::text, r.subject_id,
           r.status::text, r.status_reason, r.confidence::text, r.business_identifier,
           r.verified_data, r.provider::text, r.provider_reference
      FROM public.verification_manual_reviews m
      JOIN public.verification_requests r ON r.id = m.request_id
     WHERE r.subject_type = ${subjectType}::verification_subject_kind
       AND (${includeResolved ? 1 : 0} = 1 OR m.state IN ('queued','in_review'))
     ORDER BY m.created_at ASC
     LIMIT 200
  `) as unknown as QueueRow[];
  return rows;
}

/** Assign a review to the given agent (system_user id). Idempotent. */
export async function assignReview(reviewId: number, agentId: number): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE public.verification_manual_reviews
       SET assigned_to = ${agentId},
           assigned_at = NOW(),
           state = CASE WHEN state = 'queued' THEN 'in_review'::verification_manual_review_state ELSE state END,
           updated_at = NOW()
     WHERE id = ${reviewId}
  `;
}

/** Resolve a review with a final decision and mirror it to the underlying request. */
export async function resolveReview(
  reviewId: number,
  decision: "verified" | "rejected" | "overridden",
  notes: string | null,
  actorId: number,
  ip: string | null,
  ua: string | null,
): Promise<void> {
  const sql = getSql();
  const before = (await sql`
    SELECT id, request_id, state::text FROM public.verification_manual_reviews WHERE id = ${reviewId}
  `) as unknown as Array<{ id: number; request_id: number; state: string }>;
  if (before.length === 0) throw new Error("review_not_found");
  const prev = before[0]!;

  // Update the review row.
  await sql`
    UPDATE public.verification_manual_reviews
       SET state = 'resolved',
           resolution_decision = ${decision}::verification_status_kind,
           notes = ${notes},
           resolved_at = NOW(),
           resolved_by = ${actorId},
           updated_at = NOW()
     WHERE id = ${reviewId}
  `;

  // Mirror the outcome onto the parent request. 'overridden' also acts as verified
  // for downstream projection (rider_documents.status).
  const requestStatus = decision === "overridden" ? "overridden" : decision;
  await sql`
    UPDATE public.verification_requests
       SET status = ${requestStatus}::verification_status_kind,
           status_reason = ${notes},
           updated_at = NOW()
     WHERE id = ${prev.request_id}
  `;

  // Timeline event.
  await sql`
    INSERT INTO public.verification_events
      (request_id, event_kind, from_status, to_status, actor_type, actor_id, actor_display, details)
    VALUES
      (${prev.request_id}, 'manual_verified'::verification_event_kind,
       NULL, ${requestStatus}::verification_status_kind,
       'agent'::verification_actor_kind, ${actorId}, ${"system_user:" + actorId},
       ${JSON.stringify({ notes, decision })}::jsonb)
  `;

  // Audit log.
  await sql`
    INSERT INTO public.verification_audit_logs
      (actor_id, action, target_kind, target_id, before_snapshot, after_snapshot, reason, ip_address, user_agent)
    VALUES
      (${actorId}, 'manual_review_resolved', 'manual_review', ${reviewId},
       ${JSON.stringify(prev)}::jsonb,
       ${JSON.stringify({ decision, notes })}::jsonb,
       ${notes}, ${ip}, ${ua})
  `;
}
