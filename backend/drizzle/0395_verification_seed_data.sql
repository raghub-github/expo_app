-- ============================================================================
--  0395_verification_seed_data
--
--  Safe defaults. Every row here is deliberately conservative:
--    - Every (subject_type, document_kind) starts at mode='manual'. No auto
--      call happens until an admin explicitly flips a slot to auto/hybrid.
--    - Provider configs point at sandbox by default. Production URL exists
--      but is_active=false until ops flips the switch.
--    - Kill switches all start 'enabled' — no doc kind is force-manual by
--      default. If Cashfree misbehaves in prod, ops flip one row here to
--      route everything through the manual flow immediately.
--
--  Idempotent: every INSERT is guarded by NOT EXISTS so this migration can
--  re-run without duplicating rows.
-- ============================================================================

-- ── Provider configs ──────────────────────────────────────────────────────

-- Cashfree sandbox (default active for dev + staging).
INSERT INTO verification_provider_configs
  (provider, environment, base_url, credential_ref, webhook_secret_ref,
   api_version, timeout_ms, rate_limit_tpm, enabled_products, is_active, notes)
SELECT
  'cashfree', 'sandbox',
  'https://sandbox.cashfree.com/verification',
  'env:CASHFREE_SANDBOX_CLIENT_ID',        -- runtime resolves; keeps secret out of DB
  'env:CASHFREE_SANDBOX_CLIENT_SECRET',    -- Cashfree uses client_secret for webhook HMAC
  '2023-12-12', 15000, 100,
  '{
     "pan":true,"pan_360":false,
     "aadhaar_digilocker":true,
     "driving_licence":true,"vehicle_rc":true,"passport":true,
     "ifsc":true,"bank_account":false,"reverse_penny_drop":true,
     "upi_penny_drop":false,
     "gstin":true,"cin":true,
     "face_liveness":false,"face_match":false,"name_match":true
  }'::jsonb,
  TRUE,
  'Sandbox — no cost per call. bank_account=false until Cashfree sandbox stops returning failed_at_bank on known-good inputs.'
WHERE NOT EXISTS (
  SELECT 1 FROM verification_provider_configs
   WHERE provider = 'cashfree' AND environment = 'sandbox'
);

-- Cashfree production (inactive by default; ops flips is_active when ready).
INSERT INTO verification_provider_configs
  (provider, environment, base_url, credential_ref, webhook_secret_ref,
   api_version, timeout_ms, rate_limit_tpm, enabled_products, is_active, notes)
SELECT
  'cashfree', 'production',
  'https://api.cashfree.com/verification',
  'env:CASHFREE_PROD_CLIENT_ID',
  'env:CASHFREE_PROD_CLIENT_SECRET',
  '2023-12-12', 15000, 100,
  '{
     "pan":true,"pan_360":false,
     "aadhaar_digilocker":true,
     "driving_licence":true,"vehicle_rc":true,"passport":true,
     "ifsc":true,"bank_account":false,"reverse_penny_drop":true,
     "upi_penny_drop":false,
     "gstin":true,"cin":true,
     "face_liveness":false,"face_match":false,"name_match":true
  }'::jsonb,
  FALSE,
  'Production — flip is_active=true after prod IP whitelisted on Cashfree dashboard AND a real payment key is loaded.'
WHERE NOT EXISTS (
  SELECT 1 FROM verification_provider_configs
   WHERE provider = 'cashfree' AND environment = 'production'
);

-- Razorpay (bank verification only). Kept alongside Cashfree so rider bank
-- can route here while Cashfree BAV sandbox is broken.
INSERT INTO verification_provider_configs
  (provider, environment, base_url, credential_ref, webhook_secret_ref,
   api_version, timeout_ms, rate_limit_tpm, enabled_products, is_active, notes)
SELECT
  'razorpay', 'production',
  'https://api.razorpay.com/v1',
  'env:RAZORPAY_KEY_ID',
  'env:RAZORPAY_WEBHOOK_SECRET',
  NULL, 15000, 60,
  '{"bank_account":true,"upi_penny_drop":true}'::jsonb,
  TRUE,
  'Reused from existing merchant bank verification path. Kept enabled so we do not accidentally break /mx/profile bank verify.'
WHERE NOT EXISTS (
  SELECT 1 FROM verification_provider_configs
   WHERE provider = 'razorpay' AND environment = 'production'
);

-- ── Baseline policies: every (subject × doc_kind) starts at MANUAL ────────
--
-- The lateral join expands into 2 × 15 = 30 rows. mode='manual' means no
-- provider is called; the doc goes through the existing manual approval
-- workflow untouched. Admin flips slots to 'auto'/'hybrid' via the policy
-- center once we're ready per document kind.
INSERT INTO verification_policies
  (subject_type, document_kind, mode, provider, auto_approve,
   confidence_threshold, retry_limit, retry_backoff_seconds, timeout_ms,
   fallback_to_manual, subject_filter, effective_from, notes)
SELECT
  s.subject_type::verification_subject_kind,
  d.document_kind::verification_document_kind,
  'manual'::verification_policy_mode,
  NULL, TRUE, NULL, 2, 30, 15000, TRUE,
  '{}'::jsonb, NOW(),
  'Seed row — all doc kinds start at manual. Flip via policy center to enable auto verification.'
FROM (VALUES ('rider'), ('merchant_store')) AS s(subject_type)
CROSS JOIN (VALUES
    ('pan'), ('pan_360'),
    ('aadhaar_digilocker'),
    ('driving_licence'), ('vehicle_rc'), ('passport'),
    ('ifsc'), ('bank_account'),
    ('reverse_penny_drop'), ('upi_penny_drop'),
    ('gstin'), ('cin'),
    ('face_liveness'), ('face_match'),
    ('name_match')
  ) AS d(document_kind)
WHERE NOT EXISTS (
  SELECT 1 FROM verification_policies vp
   WHERE vp.subject_type = s.subject_type::verification_subject_kind
     AND vp.document_kind = d.document_kind::verification_document_kind
     AND vp.effective_to IS NULL
);

-- Take a version snapshot for every seed policy so verification_requests can
-- always reference a policy_snapshot_id when the first real call fires.
INSERT INTO verification_policy_versions
  (policy_id, version_number, policy_snapshot, changed_by, change_reason)
SELECT
  p.id, 1,
  to_jsonb(p),
  NULL,
  'Initial seed — every doc kind starts on manual.'
FROM verification_policies p
WHERE NOT EXISTS (
  SELECT 1 FROM verification_policy_versions
   WHERE policy_id = p.id AND version_number = 1
);

-- ── Kill switches: every (provider, doc_kind) starts 'enabled' ────────────
--
-- Also add a per-provider "everything" switch (document_kind IS NULL) so ops
-- can turn off Cashfree in one row without listing every doc kind.
INSERT INTO verification_switches
  (provider, document_kind, state, reason, tripped_by)
SELECT
  p.provider::verification_provider_kind,
  d.document_kind::verification_document_kind,
  'enabled'::verification_switch_state,
  'Seed row — no override.',
  'seed'
FROM (VALUES ('cashfree'), ('razorpay')) AS p(provider)
CROSS JOIN (VALUES
    ('pan'), ('pan_360'),
    ('aadhaar_digilocker'),
    ('driving_licence'), ('vehicle_rc'), ('passport'),
    ('ifsc'), ('bank_account'),
    ('reverse_penny_drop'), ('upi_penny_drop'),
    ('gstin'), ('cin'),
    ('face_liveness'), ('face_match'),
    ('name_match')
  ) AS d(document_kind)
WHERE NOT EXISTS (
  SELECT 1 FROM verification_switches vs
   WHERE vs.provider = p.provider::verification_provider_kind
     AND vs.document_kind = d.document_kind::verification_document_kind
     AND vs.restored_at IS NULL
);

INSERT INTO verification_switches
  (provider, document_kind, state, reason, tripped_by)
SELECT
  p.provider::verification_provider_kind, NULL,
  'enabled'::verification_switch_state,
  'Seed — provider-wide switch. Flip state=disabled to kill this provider.',
  'seed'
FROM (VALUES ('cashfree'), ('razorpay')) AS p(provider)
WHERE NOT EXISTS (
  SELECT 1 FROM verification_switches vs
   WHERE vs.provider = p.provider::verification_provider_kind
     AND vs.document_kind IS NULL
     AND vs.restored_at IS NULL
);
