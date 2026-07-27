-- 0460: Persist full Cashfree DL + RC verification payloads into DB tables.
--
-- Goals:
-- 1) Keep rider DL/RC electronic verify on Cashfree hybrid (idempotent with 0459).
-- 2) Add first-class rider_vehicles columns for RC chassis / engine / fitness / PUC.
-- 3) Backfill rider_documents (dl/rc) from extracted_data_summary.verifiedData.
-- 4) Backfill / upsert rider_vehicles from verified RC rows so profile columns
--    are populated for any prior Cashfree RC success.
--
-- Identity docs: Aadhaar / PAN / DL (name+DOB on riders / rider_documents).
-- Vehicle docs: RC → rider_vehicles (owner may differ from rider).

-- ── 1) Policy: Cashfree hybrid for rider DL + RC ───────────────────────────
UPDATE public.verification_policies
SET
  mode = 'hybrid'::verification_policy_mode,
  provider = 'cashfree'::verification_provider_kind,
  auto_approve = TRUE,
  fallback_to_manual = TRUE,
  timeout_ms = COALESCE(timeout_ms, 15000),
  retry_limit = COALESCE(retry_limit, 2),
  retry_backoff_seconds = COALESCE(retry_backoff_seconds, 30),
  notes = COALESCE(notes, '') || ' | 0460: DL/RC Cashfree data persist',
  updated_at = NOW()
WHERE subject_type = 'rider'::verification_subject_kind
  AND document_kind IN (
    'driving_licence'::verification_document_kind,
    'vehicle_rc'::verification_document_kind
  )
  AND effective_to IS NULL;

INSERT INTO public.verification_policy_versions
  (policy_id, version_number, policy_snapshot, changed_by, change_reason)
SELECT
  p.id,
  COALESCE(
    (SELECT MAX(v.version_number) FROM public.verification_policy_versions v WHERE v.policy_id = p.id),
    0
  ) + 1,
  to_jsonb(p),
  NULL,
  '0460: rider DL/RC Cashfree hybrid + data persist'
FROM public.verification_policies p
WHERE p.subject_type = 'rider'::verification_subject_kind
  AND p.document_kind IN (
    'driving_licence'::verification_document_kind,
    'vehicle_rc'::verification_document_kind
  )
  AND p.effective_to IS NULL;

-- ── 2) Extra RC columns on rider_vehicles (nullable; safe add) ─────────────
ALTER TABLE public.rider_vehicles
  ADD COLUMN IF NOT EXISTS chassis_number text,
  ADD COLUMN IF NOT EXISTS engine_number text,
  ADD COLUMN IF NOT EXISTS fitness_expiry date,
  ADD COLUMN IF NOT EXISTS puc_expiry date,
  ADD COLUMN IF NOT EXISTS rc_owner_name text,
  ADD COLUMN IF NOT EXISTS cashfree_rc_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.rider_vehicles.chassis_number IS
  'Vehicle chassis from Cashfree RC verify (vehicle_chasi_number).';
COMMENT ON COLUMN public.rider_vehicles.engine_number IS
  'Vehicle engine number from Cashfree RC verify.';
COMMENT ON COLUMN public.rider_vehicles.fitness_expiry IS
  'Fitness validity date from Cashfree RC (fitness_upto).';
COMMENT ON COLUMN public.rider_vehicles.puc_expiry IS
  'PUC validity date from Cashfree RC (puc_upto).';
COMMENT ON COLUMN public.rider_vehicles.rc_owner_name IS
  'Registered RC owner name from Cashfree — may differ from rider (vehicle ownership).';
COMMENT ON COLUMN public.rider_vehicles.cashfree_rc_payload IS
  'Full Cashfree vehicle_rc verifiedData snapshot for audit / future NOC/fleet.';

CREATE INDEX IF NOT EXISTS rider_vehicles_chassis_number_idx
  ON public.rider_vehicles USING btree (chassis_number)
  WHERE chassis_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS rider_vehicles_engine_number_idx
  ON public.rider_vehicles USING btree (engine_number)
  WHERE engine_number IS NOT NULL;

-- ── 3) Helper: parse common Indian dates from Cashfree strings ─────────────
CREATE OR REPLACE FUNCTION public.gm_parse_cashfree_date(raw text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text := NULLIF(btrim(COALESCE(raw, '')), '');
BEGIN
  IF s IS NULL OR lower(s) IN ('na', 'n/a', '-', '00/00/0000') THEN
    RETURN NULL;
  END IF;
  IF s ~ '^\d{4}-\d{2}-\d{2}' THEN
    RETURN substring(s from 1 for 10)::date;
  END IF;
  IF s ~ '^\d{1,2}[-/]\d{1,2}[-/]\d{4}$' THEN
    RETURN to_date(s, CASE WHEN position('/' in s) > 0 THEN 'DD/MM/YYYY' ELSE 'DD-MM-YYYY' END);
  END IF;
  IF s ~ '^\d{1,2}[-/]\d{4}$' THEN
    RETURN to_date('01/' || replace(s, '-', '/'), 'DD/MM/YYYY');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ── 4) Backfill rider_documents DL rows from Cashfree verifiedData ──────────
UPDATE public.rider_documents d
SET
  doc_number = COALESCE(
    NULLIF(btrim(d.doc_number), ''),
    NULLIF(upper(btrim(d.extracted_data_summary #>> '{verifiedData,dl_number}')), ''),
    NULLIF(upper(btrim(d.metadata->>'dlNumber')), '')
  ),
  extracted_name = COALESCE(
    NULLIF(btrim(d.extracted_name), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,name}'), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,holder_name}'), '')
  ),
  extracted_dob = COALESCE(
    d.extracted_dob,
    public.gm_parse_cashfree_date(d.extracted_data_summary #>> '{verifiedData,dob}')
  ),
  metadata = COALESCE(d.metadata, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'dlNumber', COALESCE(
        NULLIF(upper(btrim(d.doc_number)), ''),
        NULLIF(upper(btrim(d.extracted_data_summary #>> '{verifiedData,dl_number}')), ''),
        NULLIF(upper(btrim(d.metadata->>'dlNumber')), '')
      ),
      'cashfreeVerifiedData', COALESCE(
        d.extracted_data_summary->'verifiedData',
        d.metadata->'cashfreeVerifiedData'
      ),
      'cashfreeProvider', 'cashfree',
      'identityDocument', true,
      'source', '0460_dl_rc_verify_persist'
    )),
  verified = CASE
    WHEN d.extracted_data_summary->'verifiedData' IS NOT NULL
      AND COALESCE(d.extracted_data_summary->>'status', '') IN ('', 'verified', 'VALID')
      THEN TRUE
    ELSE d.verified
  END,
  verification_status = CASE
    WHEN d.extracted_data_summary->'verifiedData' IS NOT NULL
      AND d.verified IS DISTINCT FROM FALSE
      THEN 'auto_verified'::document_verification_status
    ELSE d.verification_status
  END,
  verification_method = CASE
    WHEN d.extracted_data_summary->'verifiedData' IS NOT NULL
      THEN COALESCE(d.verification_method, 'APP_VERIFIED'::verification_method)
    ELSE d.verification_method
  END,
  updated_at = NOW()
WHERE d.doc_type::text IN ('dl', 'dl_front', 'dl_back')
  AND (
    d.extracted_data_summary->'verifiedData' IS NOT NULL
    OR NULLIF(btrim(d.metadata->>'dlNumber'), '') IS NOT NULL
    OR d.last_verification_id IS NOT NULL
  );

-- ── 5) Backfill rider_documents RC rows from Cashfree verifiedData ──────────
UPDATE public.rider_documents d
SET
  doc_number = COALESCE(
    NULLIF(btrim(d.doc_number), ''),
    NULLIF(upper(regexp_replace(
      COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', ''),
      '[^A-Za-z0-9]', '', 'g'
    )), ''),
    NULLIF(upper(btrim(d.metadata->>'rcNumber')), '')
  ),
  extracted_name = COALESCE(
    NULLIF(btrim(d.extracted_name), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,owner}'), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,owner_name}'), '')
  ),
  metadata = COALESCE(d.metadata, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'rcNumber', COALESCE(
        NULLIF(upper(regexp_replace(COALESCE(d.doc_number, ''), '[^A-Za-z0-9]', '', 'g')), ''),
        NULLIF(upper(regexp_replace(
          COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', ''),
          '[^A-Za-z0-9]', '', 'g'
        )), ''),
        NULLIF(upper(btrim(d.metadata->>'rcNumber')), '')
      ),
      'rcOwnerName', COALESCE(
        NULLIF(btrim(d.extracted_name), ''),
        NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,owner}'), '')
      ),
      'cashfreeVerifiedData', COALESCE(
        d.extracted_data_summary->'verifiedData',
        d.metadata->'cashfreeVerifiedData'
      ),
      'cashfreeProvider', 'cashfree',
      'vehicleVerificationOnly', true,
      'source', '0460_dl_rc_verify_persist'
    )),
  verified = CASE
    WHEN d.extracted_data_summary->'verifiedData' IS NOT NULL THEN TRUE
    ELSE d.verified
  END,
  verification_status = CASE
    WHEN d.extracted_data_summary->'verifiedData' IS NOT NULL
      THEN 'auto_verified'::document_verification_status
    ELSE d.verification_status
  END,
  verification_method = CASE
    WHEN d.extracted_data_summary->'verifiedData' IS NOT NULL
      THEN COALESCE(d.verification_method, 'APP_VERIFIED'::verification_method)
    ELSE d.verification_method
  END,
  requires_manual_review = CASE
    WHEN d.extracted_data_summary->'verifiedData' IS NOT NULL THEN FALSE
    ELSE d.requires_manual_review
  END,
  verified_at = COALESCE(d.verified_at, CASE
    WHEN d.extracted_data_summary->'verifiedData' IS NOT NULL THEN NOW()
    ELSE NULL
  END),
  updated_at = NOW()
WHERE d.doc_type::text = 'rc'
  AND (
    d.extracted_data_summary->'verifiedData' IS NOT NULL
    OR NULLIF(btrim(d.metadata->>'rcNumber'), '') IS NOT NULL
    OR d.last_verification_id IS NOT NULL
  );

-- ── 6) Update existing active rider_vehicles from verified RC docs ─────────
UPDATE public.rider_vehicles rv
SET
  registration_number = COALESCE(
    NULLIF(upper(regexp_replace(
      COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', d.doc_number, ''),
      '[^A-Za-z0-9]', '', 'g'
    )), ''),
    rv.registration_number
  ),
  vehicle_number = COALESCE(
    NULLIF(upper(regexp_replace(
      COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', d.doc_number, ''),
      '[^A-Za-z0-9]', '', 'g'
    )), ''),
    rv.vehicle_number
  ),
  make = COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,vehicle_manufacturer_name}'), ''),
    rv.make
  ),
  model = COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,model}'), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,maker_model}'), ''),
    rv.model
  ),
  color = COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,vehicle_colour}'), ''),
    rv.color
  ),
  year = COALESCE(
    CASE
      WHEN public.gm_parse_cashfree_date(d.extracted_data_summary #>> '{verifiedData,reg_date}') IS NOT NULL
        THEN EXTRACT(YEAR FROM public.gm_parse_cashfree_date(
          d.extracted_data_summary #>> '{verifiedData,reg_date}'
        ))::int
      ELSE NULL
    END,
    rv.year
  ),
  registration_state = COALESCE(
    NULLIF(upper(left(regexp_replace(
      COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', d.doc_number, ''),
      '[^A-Za-z0-9]', '', 'g'
    ), 2)), ''),
    rv.registration_state
  ),
  insurance_expiry = COALESCE(
    public.gm_parse_cashfree_date(
      d.extracted_data_summary #>> '{verifiedData,vehicle_insurance_upto}'
    ),
    rv.insurance_expiry
  ),
  chassis_number = COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,vehicle_chasi_number}'), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,chassis_number}'), ''),
    rv.chassis_number
  ),
  engine_number = COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,vehicle_engine_number}'), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,engine_number}'), ''),
    rv.engine_number
  ),
  fitness_expiry = COALESCE(
    public.gm_parse_cashfree_date(d.extracted_data_summary #>> '{verifiedData,fitness_upto}'),
    rv.fitness_expiry
  ),
  puc_expiry = COALESCE(
    public.gm_parse_cashfree_date(d.extracted_data_summary #>> '{verifiedData,puc_upto}'),
    rv.puc_expiry
  ),
  rc_owner_name = COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,owner}'), ''),
    NULLIF(btrim(d.extracted_name), ''),
    rv.rc_owner_name
  ),
  is_commercial = CASE
    WHEN lower(COALESCE(d.extracted_data_summary #>> '{verifiedData,is_commercial}', ''))
      IN ('true', 'yes', '1', 'commercial') THEN TRUE
    WHEN lower(COALESCE(d.extracted_data_summary #>> '{verifiedData,is_commercial}', ''))
      IN ('false', 'no', '0', 'private') THEN FALSE
    ELSE rv.is_commercial
  END,
  cashfree_rc_payload = COALESCE(d.extracted_data_summary->'verifiedData', '{}'::jsonb),
  limitation_flags = COALESCE(rv.limitation_flags, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'cashfree_vehicle_rc',
      'vehicleVerificationOnly', true,
      'backfilledBy', '0460'
    )
    || COALESCE(d.extracted_data_summary->'verifiedData', '{}'::jsonb),
  verified = TRUE,
  verified_at = COALESCE(rv.verified_at, NOW()),
  vehicle_active_status = 'active',
  is_active = TRUE,
  updated_at = NOW()
FROM public.rider_documents d
WHERE d.rider_id = rv.rider_id
  AND d.doc_type::text = 'rc'
  AND rv.deleted_at IS NULL
  AND COALESCE(rv.is_active, TRUE) = TRUE
  AND d.extracted_data_summary->'verifiedData' IS NOT NULL
  AND NULLIF(upper(regexp_replace(
    COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', d.doc_number, ''),
    '[^A-Za-z0-9]', '', 'g'
  )), '') IS NOT NULL;

-- ── 7) Insert rider_vehicles for riders with verified RC but no vehicle row ─
INSERT INTO public.rider_vehicles (
  rider_id,
  vehicle_type,
  registration_number,
  vehicle_number,
  make,
  model,
  color,
  year,
  registration_state,
  insurance_expiry,
  chassis_number,
  engine_number,
  fitness_expiry,
  puc_expiry,
  rc_owner_name,
  is_commercial,
  cashfree_rc_payload,
  limitation_flags,
  verified,
  verified_at,
  vehicle_active_status,
  is_active,
  service_types,
  ownership_type,
  created_at,
  updated_at
)
SELECT
  d.rider_id,
  'bike'::vehicle_type,
  upper(regexp_replace(
    COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', d.doc_number),
    '[^A-Za-z0-9]', '', 'g'
  )),
  upper(regexp_replace(
    COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', d.doc_number),
    '[^A-Za-z0-9]', '', 'g'
  )),
  NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,vehicle_manufacturer_name}'), ''),
  COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,model}'), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,maker_model}'), '')
  ),
  NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,vehicle_colour}'), ''),
  CASE
    WHEN public.gm_parse_cashfree_date(d.extracted_data_summary #>> '{verifiedData,reg_date}') IS NOT NULL
      THEN EXTRACT(YEAR FROM public.gm_parse_cashfree_date(
        d.extracted_data_summary #>> '{verifiedData,reg_date}'
      ))::int
    ELSE NULL
  END,
  NULLIF(upper(left(regexp_replace(
    COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', d.doc_number, ''),
    '[^A-Za-z0-9]', '', 'g'
  ), 2)), ''),
  public.gm_parse_cashfree_date(
    d.extracted_data_summary #>> '{verifiedData,vehicle_insurance_upto}'
  ),
  COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,vehicle_chasi_number}'), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,chassis_number}'), '')
  ),
  COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,vehicle_engine_number}'), ''),
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,engine_number}'), '')
  ),
  public.gm_parse_cashfree_date(d.extracted_data_summary #>> '{verifiedData,fitness_upto}'),
  public.gm_parse_cashfree_date(d.extracted_data_summary #>> '{verifiedData,puc_upto}'),
  COALESCE(
    NULLIF(btrim(d.extracted_data_summary #>> '{verifiedData,owner}'), ''),
    NULLIF(btrim(d.extracted_name), '')
  ),
  CASE
    WHEN lower(COALESCE(d.extracted_data_summary #>> '{verifiedData,is_commercial}', ''))
      IN ('true', 'yes', '1', 'commercial') THEN TRUE
    ELSE FALSE
  END,
  COALESCE(d.extracted_data_summary->'verifiedData', '{}'::jsonb),
  jsonb_build_object(
    'source', 'cashfree_vehicle_rc',
    'vehicleVerificationOnly', true,
    'backfilledBy', '0460'
  ) || COALESCE(d.extracted_data_summary->'verifiedData', '{}'::jsonb),
  TRUE,
  NOW(),
  'active',
  TRUE,
  '[]'::jsonb,
  'ownership',
  NOW(),
  NOW()
FROM public.rider_documents d
WHERE d.doc_type::text = 'rc'
  AND d.extracted_data_summary->'verifiedData' IS NOT NULL
  AND NULLIF(upper(regexp_replace(
    COALESCE(d.extracted_data_summary #>> '{verifiedData,reg_no}', d.doc_number, ''),
    '[^A-Za-z0-9]', '', 'g'
  )), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.rider_vehicles rv
    WHERE rv.rider_id = d.rider_id
      AND rv.deleted_at IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = d.rider_id AND r.deleted_at IS NULL
  );

-- Prefer one row per rider when multiple RC docs exist: keep latest by updated_at
-- (insert above only runs when rider has zero vehicles).

COMMENT ON FUNCTION public.gm_parse_cashfree_date(text) IS
  '0460 helper: parse Cashfree DL/RC date strings to date.';
