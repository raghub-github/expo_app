import "server-only";
import { getSql } from "@/lib/db/client";

/**
 * Analytics aggregations for the super-admin verification report.
 *
 * All queries hit `verification_requests` directly rather than the seeded
 * `v_verification_statistics` view because the view groups by day and this
 * page needs arbitrary date ranges + subject / doc filters.
 */

export type Filters = {
  subjectType?: "rider" | "merchant_store";
  documentKind?: string;         // e.g. 'pan', 'gstin', 'driving_licence'
  provider?: "cashfree" | "razorpay";
  fromDate?: string;             // ISO YYYY-MM-DD, inclusive
  toDate?: string;               // ISO YYYY-MM-DD, inclusive
};

export type Totals = {
  total: number;
  verified: number;
  rejected: number;
  pending: number;
  fallback_manual: number;
  timeout: number;
  provider_down: number;
  avg_duration_ms: number | null;
  avg_confidence: number | null;
};

export type BreakdownRow = {
  document_kind: string;
  subject_type: string;
  total: number;
  verified: number;
  rejected: number;
  fallback_manual: number;
  success_rate: number;
};

export type DailyRow = {
  day: string;
  total: number;
  verified: number;
  rejected: number;
  fallback_manual: number;
};

/** Compact WHERE built from filters. Nulls fall through, so no wrap-around magic. */
function buildFilterFragment(sql: ReturnType<typeof getSql>, f: Filters) {
  // postgres.js doesn't compose WHERE fragments as freely as knex; the safest
  // path is to write one big WHERE with all filters set to no-op when absent.
  return sql`
    (${f.subjectType ?? null}::text IS NULL OR subject_type::text = ${f.subjectType ?? null})
    AND (${f.documentKind ?? null}::text IS NULL OR document_kind::text = ${f.documentKind ?? null})
    AND (${f.provider ?? null}::text IS NULL OR provider::text = ${f.provider ?? null})
    AND (${f.fromDate ?? null}::text IS NULL OR created_at >= (${f.fromDate ?? null})::timestamptz)
    AND (${f.toDate ?? null}::text IS NULL OR created_at < ((${f.toDate ?? null})::timestamptz + interval '1 day'))
  `;
}

export async function getTotals(f: Filters): Promise<Totals> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='verified')::int AS verified,
      COUNT(*) FILTER (WHERE status='rejected')::int AS rejected,
      COUNT(*) FILTER (WHERE status::text IN ('initiated','pending_provider','awaiting_consent'))::int AS pending,
      COUNT(*) FILTER (WHERE status='fallback_manual')::int AS fallback_manual,
      COUNT(*) FILTER (WHERE status='timeout')::int AS timeout,
      COUNT(*) FILTER (WHERE status='provider_down')::int AS provider_down,
      ROUND(AVG(duration_ms)::numeric, 0)::float AS avg_duration_ms,
      ROUND(AVG(confidence)::numeric, 3)::float AS avg_confidence
    FROM public.verification_requests
    WHERE ${buildFilterFragment(sql, f)}
  `) as unknown as Totals[];
  return rows[0]!;
}

/** One row per (subject_type, document_kind). Feeds the main filter table. */
export async function getBreakdown(f: Filters): Promise<BreakdownRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      document_kind::text AS document_kind,
      subject_type::text AS subject_type,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='verified')::int AS verified,
      COUNT(*) FILTER (WHERE status='rejected')::int AS rejected,
      COUNT(*) FILTER (WHERE status='fallback_manual')::int AS fallback_manual,
      ROUND(
        CASE WHEN COUNT(*) = 0 THEN 0
             ELSE COUNT(*) FILTER (WHERE status='verified')::numeric / COUNT(*)::numeric
        END * 100, 1
      )::float AS success_rate
    FROM public.verification_requests
    WHERE ${buildFilterFragment(sql, f)}
    GROUP BY document_kind, subject_type
    ORDER BY total DESC, document_kind
  `) as unknown as BreakdownRow[];
  return rows;
}

/** Last 14 days of activity to sparkline the header. */
export async function getDaily(f: Filters, days = 14): Promise<DailyRow[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='verified')::int AS verified,
      COUNT(*) FILTER (WHERE status='rejected')::int AS rejected,
      COUNT(*) FILTER (WHERE status='fallback_manual')::int AS fallback_manual
    FROM public.verification_requests
    WHERE created_at >= NOW() - (${days}::text || ' days')::interval
      AND ${buildFilterFragment(sql, f)}
    GROUP BY 1
    ORDER BY 1
  `) as unknown as DailyRow[];
  return rows;
}
