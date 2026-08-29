/**
 * Insert CSAT/DSAT into unified_ticket_activity_audit after a rating is saved.
 * Failures are swallowed so rating APIs never break if the audit table is missing.
 */

type SqlTagged = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (strings: TemplateStringsArray, ...values: any[]): Promise<any> | any;
};

function bucket(rating: number): "CSAT" | "DSAT" | "Neutral" {
  if (rating >= 4) return "CSAT";
  if (rating <= 2) return "DSAT";
  return "Neutral";
}

export async function insertSatisfactionRatingAudit(
  sql: SqlTagged,
  opts: {
    ticketId: number;
    rating: number;
    feedback?: string | null;
    actorType?: string | null;
    actorName?: string | null;
  }
): Promise<void> {
  const b = bucket(opts.rating);
  const feedback =
    typeof opts.feedback === "string" && opts.feedback.trim() !== "" ? opts.feedback.trim() : null;
  const description = `${b} ${opts.rating}/5 submitted`;
  const newValue = JSON.stringify({
    rating: opts.rating,
    feedback,
    bucket: b.toLowerCase(),
  });
  const actorType = opts.actorType ?? "CUSTOMER";
  const actorName = opts.actorName ?? null;
  try {
    await sql`
      INSERT INTO public.unified_ticket_activity_audit (
        ticket_id, activity_type, activity_category, activity_description,
        actor_type, actor_name, new_value, changed_fields, update_source
      ) VALUES (
        ${opts.ticketId},
        'satisfaction_rating',
        'feedback',
        ${description},
        ${actorType},
        ${actorName},
        ${newValue}::text::jsonb,
        ARRAY['satisfaction_rating','satisfaction_feedback','satisfaction_collected_at']::text[],
        'system'
      )
    `;
  } catch (e) {
    console.warn("[ticket-satisfaction-audit] insert failed:", e);
  }
}
