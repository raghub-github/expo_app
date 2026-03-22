import type { SupabaseClient } from "@supabase/supabase-js";

/** Per-step rejection shown to merchants (from store_verification_step_rejections). */
export type PartnerVerificationStepRejection = {
  step_number: number;
  step_label: string | null;
  rejection_reason: string;
  rejected_at: string;
  merchant_resubmitted_at: string | null;
};

/**
 * Load open verification rejections for internal merchant_stores.id values.
 */
export async function fetchVerificationRejectionsByStoreIds(
  db: SupabaseClient,
  storeInternalIds: number[]
): Promise<Record<number, PartnerVerificationStepRejection[]>> {
  const ids = storeInternalIds.filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return {};

  const { data, error } = await db
    .from("store_verification_step_rejections")
    .select(
      "store_id, step_number, step_label, rejection_reason, rejected_at, merchant_resubmitted_at"
    )
    .in("store_id", ids);

  if (error) {
    console.warn("[fetchVerificationRejectionsByStoreIds]", error.message);
    return {};
  }

  const byStore: Record<number, PartnerVerificationStepRejection[]> = {};
  for (const row of data ?? []) {
    const sid = row.store_id as number;
    if (sid == null) continue;
    if (!byStore[sid]) byStore[sid] = [];
    byStore[sid].push({
      step_number: Number(row.step_number),
      step_label: (row.step_label as string | null) ?? null,
      rejection_reason: String(row.rejection_reason ?? ""),
      rejected_at:
        typeof row.rejected_at === "string"
          ? row.rejected_at
          : row.rejected_at != null
            ? String(row.rejected_at)
            : "",
      merchant_resubmitted_at:
        row.merchant_resubmitted_at == null
          ? null
          : typeof row.merchant_resubmitted_at === "string"
            ? row.merchant_resubmitted_at
            : String(row.merchant_resubmitted_at),
    });
  }

  for (const sid of Object.keys(byStore)) {
    byStore[Number(sid)].sort((a, b) => a.step_number - b.step_number);
  }

  return byStore;
}

export function partnerVerificationRejectionsTooltip(
  rejections: PartnerVerificationStepRejection[]
): string {
  return rejections
    .map(
      (r) =>
        `${r.step_label?.trim() || `Step ${r.step_number}`}: ${r.rejection_reason}`.trim()
    )
    .join("\n\n");
}
