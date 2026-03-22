import { getSql } from "@/lib/db/client";

let ensurePromise: Promise<void> | null = null;

/**
 * Ensures step 4 JSON columns on merchant_store_documents (idempotent).
 */
export function ensureMerchantStoreDocumentsStep4JsonColumns(): Promise<void> {
  if (!ensurePromise) {
    const sql = getSql() as { unsafe: (query: string) => Promise<unknown> };
    ensurePromise = sql
      .unsafe(`
        ALTER TABLE public.merchant_store_documents
          ADD COLUMN IF NOT EXISTS step4_resubmission_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
          ADD COLUMN IF NOT EXISTS step4_rejection_details jsonb NOT NULL DEFAULT '{}'::jsonb
      `)
      .then(() => undefined)
      .catch((err) => {
        ensurePromise = null;
        throw err;
      });
  }
  return ensurePromise;
}

/** @deprecated alias */
export const ensureMerchantStoreDocumentsStep4ResubmissionFlagsColumn =
  ensureMerchantStoreDocumentsStep4JsonColumns;
