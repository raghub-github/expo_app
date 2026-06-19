/**
 * Stores pending admin review after partner re-uploads rejected onboarding docs
 * OR renews an expired licence (`renewal_pending` on merchant_store_documents).
 */

import { getSql } from "../client";

const RENEWAL_PREFIXES = [
  "pan",
  "gst",
  "aadhaar",
  "fssai",
  "drug_license",
  "shop_establishment",
  "trade_license",
  "udyam",
  "pharmacist_certificate",
  "pharmacy_council_registration",
  "other",
] as const;

function renewalPendingDocOr(prefix: (typeof RENEWAL_PREFIXES)[number]): string {
  const meta = `${prefix}_document_metadata`;
  const verified = `${prefix}_is_verified`;
  const url = `${prefix}_document_url`;
  const num = `${prefix}_document_number`;
  return `(
    COALESCE(d.${meta} @> '{"renewal_pending": true}', false)
    AND COALESCE(d.${verified}, false) IS NOT TRUE
    AND (
      d.${url} IS NOT NULL
      OR NULLIF(TRIM(COALESCE(d.${num}, '')), '') IS NOT NULL
    )
  )`;
}

const EXPIRED_DOC_RESUBMISSION_EXISTS_SQL = `
  EXISTS (
    SELECT 1 FROM merchant_store_documents d
    WHERE d.store_id = merchant_stores.id
      AND (
        ${RENEWAL_PREFIXES.map((p) => renewalPendingDocOr(p)).join("\n        OR ")}
      )
  )
`;

const ONBOARDING_RESUBMISSION_EXISTS_SQL = `
  EXISTS (
    SELECT 1 FROM store_verification_step_rejections r
    WHERE r.store_id = merchant_stores.id
      AND r.merchant_resubmitted_at IS NOT NULL
  )
`;

/** SQL boolean expression — true when store needs doc re-review. */
export function merchantStoreResubmittedDocsPendingSql() {
  return getSql().unsafe(`
  (
    ${ONBOARDING_RESUBMISSION_EXISTS_SQL}
    OR ${EXPIRED_DOC_RESUBMISSION_EXISTS_SQL}
  )
`);
}
