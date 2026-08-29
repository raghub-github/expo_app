/**
 * Record CSAT/DSAT submissions into unified_ticket_activity_audit
 * so ticket Activity timeline and agent activity stay in sync.
 */
import {
  insertTicketActivityAudit,
  type TicketAuditSqlClient,
} from "@/lib/db/operations/ticket-activity-audit";

export function satisfactionBucket(rating: number): "CSAT" | "DSAT" | "Neutral" {
  if (rating >= 4) return "CSAT";
  if (rating <= 2) return "DSAT";
  return "Neutral";
}

export async function insertSatisfactionRatingAudit(
  sqlClient: TicketAuditSqlClient,
  opts: {
    ticketId: number;
    rating: number;
    feedback?: string | null;
    actorType?: string | null;
    actorName?: string | null;
    actorEmail?: string | null;
    actorUserId?: number | null;
  }
): Promise<void> {
  const bucket = satisfactionBucket(opts.rating);
  const feedback =
    typeof opts.feedback === "string" && opts.feedback.trim() !== "" ? opts.feedback.trim() : null;
  await insertTicketActivityAudit(sqlClient, {
    ticket_id: opts.ticketId,
    activity_type: "satisfaction_rating",
    activity_category: "feedback",
    activity_description: `${bucket} ${opts.rating}/5 submitted`,
    actor_user_id: opts.actorUserId ?? null,
    actor_type: opts.actorType ?? "CUSTOMER",
    actor_name: opts.actorName ?? null,
    actor_email: opts.actorEmail ?? null,
    new_value: {
      rating: opts.rating,
      feedback,
      bucket: bucket.toLowerCase(),
    },
    changed_fields: ["satisfaction_rating", "satisfaction_feedback", "satisfaction_collected_at"],
    update_source: "system",
  });
}
