/**
 * Account deletion request queue — Customers dashboard ops.
 * Reads/writes public.account_deletion_requests and closes customers on complete.
 */

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import type { AccountDeletionRequestRow } from "@/lib/customers/account-deletion-request-types";

export type { AccountDeletionRequestRow } from "@/lib/customers/account-deletion-request-types";

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function countPendingAccountDeletionRequests(): Promise<number> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT count(*)::int AS count
      FROM account_deletion_requests
      WHERE status = 'pending_review'
    `);
    return asNum((rows as unknown as Record<string, unknown>[])[0]?.count) ?? 0;
  } catch {
    return 0;
  }
}

export async function listAccountDeletionRequests(input?: {
  status?: string;
  limit?: number;
}): Promise<AccountDeletionRequestRow[]> {
  const db = getDb();
  const status = input?.status?.trim() || "pending_review";
  const limit = Math.min(200, Math.max(1, input?.limit ?? 100));

  try {
    const rows = await db.execute(sql`
      SELECT
        r.id,
        r.customer_id,
        r.phone_e164,
        r.reason_code,
        r.reason_text,
        r.status,
        r.source,
        r.requested_at,
        r.reviewed_at,
        r.reviewed_by,
        r.review_notes,
        c.id AS customers_pk,
        c.full_name,
        c.primary_mobile,
        c.account_status
      FROM account_deletion_requests r
      LEFT JOIN customers c ON c.customer_id = r.customer_id
      WHERE r.status = ${status}
      ORDER BY r.requested_at ASC
      LIMIT ${limit}
    `);

    return (rows as unknown as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id) || 0,
      customerId: r.customer_id != null ? String(r.customer_id) : "",
      phoneE164: r.phone_e164 != null ? String(r.phone_e164) : null,
      reasonCode: r.reason_code != null ? String(r.reason_code) : "other",
      reasonText: r.reason_text != null ? String(r.reason_text) : null,
      status: r.status != null ? String(r.status) : "pending_review",
      source: r.source != null ? String(r.source) : "app",
      requestedAt:
        r.requested_at instanceof Date
          ? r.requested_at.toISOString()
          : r.requested_at != null
            ? String(r.requested_at)
            : "",
      reviewedAt:
        r.reviewed_at instanceof Date
          ? r.reviewed_at.toISOString()
          : r.reviewed_at != null
            ? String(r.reviewed_at)
            : null,
      reviewedBy: r.reviewed_by != null ? String(r.reviewed_by) : null,
      reviewNotes: r.review_notes != null ? String(r.review_notes) : null,
      customerName: r.full_name != null ? String(r.full_name) : null,
      customerMobile:
        r.primary_mobile != null
          ? String(r.primary_mobile)
          : r.phone_e164 != null
            ? String(r.phone_e164)
            : null,
      accountStatus: r.account_status != null ? String(r.account_status) : null,
      customersPk: asNum(r.customers_pk),
    }));
  } catch {
    return [];
  }
}

/**
 * Admin completes deletion: deactivate customer, invalidate JWTs (app logout),
 * mark request completed. Identity data is retained per policy.
 */
export async function completeAccountDeletionRequest(input: {
  requestId: number;
  reviewedBy: string;
  reviewNotes?: string | null;
}): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
  const db = getDb();
  const requestId = input.requestId;
  if (!Number.isFinite(requestId) || requestId <= 0) {
    return { ok: false, error: "Invalid request id" };
  }

  try {
    const rows = await db.execute(sql`
      SELECT id, customer_id, status, reason_text, reason_code
      FROM account_deletion_requests
      WHERE id = ${requestId}
      LIMIT 1
    `);
    const req = (rows as unknown as Record<string, unknown>[])[0];
    if (!req) return { ok: false, error: "Request not found" };

    const status = String(req.status ?? "");
    if (status === "completed") {
      return { ok: true, customerId: String(req.customer_id) };
    }
    if (status !== "pending_review" && status !== "approved") {
      return { ok: false, error: `Cannot delete request in status "${status}"` };
    }

    const customerId = String(req.customer_id);
    const reason =
      (req.reason_text != null ? String(req.reason_text) : null) ||
      (req.reason_code != null ? String(req.reason_code) : "account_deletion");
    const now = new Date();
    const reviewedBy = input.reviewedBy.slice(0, 200);
    const notes = (input.reviewNotes ?? "").toString().slice(0, 2000) || null;

    await db.execute(sql`
      UPDATE customers
      SET
        account_status = 'DEACTIVATED',
        status_reason = 'account_deletion_completed',
        deleted_at = COALESCE(deleted_at, ${now}),
        deletion_reason = ${reason},
        sessions_invalid_before = ${now},
        updated_at = ${now}
      WHERE customer_id = ${customerId}
    `);

    // Also invalidate user_profiles sessions if the GM id matches.
    try {
      await db.execute(sql`
        UPDATE user_profiles
        SET sessions_invalid_before = ${now}, updated_at = ${now}
        WHERE user_id = ${customerId}
      `);
    } catch {
      /* optional table / column */
    }

    await db.execute(sql`
      UPDATE account_deletion_requests
      SET
        status = 'completed',
        reviewed_at = ${now},
        reviewed_by = ${reviewedBy},
        review_notes = ${notes},
        updated_at = ${now}
      WHERE id = ${requestId}
    `);

    return { ok: true, customerId };
  } catch (e) {
    console.error("[account-deletion] complete failed", e);
    return { ok: false, error: "Failed to complete account deletion" };
  }
}
