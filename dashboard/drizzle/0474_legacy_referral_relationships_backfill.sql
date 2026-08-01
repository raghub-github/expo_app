-- =============================================================================
-- 0474: Backfill legacy customer/rider referral relationships
-- =============================================================================
-- Safe and idempotent.
--
-- Why:
-- Older accounts store referral ownership directly on:
--   customers.referred_by / customers.referrer_customer_id
--   riders.referred_by
-- Some environments never populated customer_referrals / referrals, so migration
-- 0470 had nothing to import and Super Admin analytics incorrectly showed zero.
--
-- This migration:
--   * preserves existing user referral codes
--   * resolves old referred_by codes to the original referrer
--   * creates missing referral_relationships rows only
--   * grandfathers old mappings as attributed, allowing future qualifying events
--   * adds lifecycle/funnel history without creating or crediting rewards
--   * never duplicates wallet credits or reward transactions
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Normalize old profile codes and resolve customer referrer IDs
-- -----------------------------------------------------------------------------
UPDATE public.customers
SET referred_by = UPPER(TRIM(referred_by)),
    updated_at = NOW()
WHERE referred_by IS NOT NULL
  AND TRIM(referred_by) <> ''
  AND referred_by IS DISTINCT FROM UPPER(TRIM(referred_by));

UPDATE public.customers referred
SET referrer_customer_id = referrer.id,
    updated_at = NOW()
FROM public.customers referrer
WHERE referred.referrer_customer_id IS NULL
  AND referred.referred_by IS NOT NULL
  AND TRIM(referred.referred_by) <> ''
  AND UPPER(TRIM(referrer.referral_code)) = UPPER(TRIM(referred.referred_by))
  AND referrer.id <> referred.id;

-- referral_codes fallback (covers codes already migrated into referral_codes).
UPDATE public.customers referred
SET referrer_customer_id = rc.user_id,
    updated_at = NOW()
FROM public.referral_codes rc
WHERE referred.referrer_customer_id IS NULL
  AND referred.referred_by IS NOT NULL
  AND TRIM(referred.referred_by) <> ''
  AND rc.user_type = 'customer'
  AND rc.active = true
  AND COALESCE(rc.suspended, false) = false
  AND UPPER(TRIM(rc.referral_code)) = UPPER(TRIM(referred.referred_by))
  AND rc.user_id <> referred.id;

-- -----------------------------------------------------------------------------
-- 2. Customers: profile columns -> referral_relationships
-- -----------------------------------------------------------------------------
INSERT INTO public.referral_relationships (
  user_type,
  referrer_id,
  referred_user_id,
  referral_code,
  source,
  install_at,
  app_open_at,
  first_open_at,
  auto_applied,
  attribution_consumed,
  status,
  reward_status,
  completed_orders,
  lifecycle_state,
  metadata,
  created_at,
  updated_at
)
SELECT
  'customer'::referral_user_type,
  referrer.id,
  referred.id,
  UPPER(TRIM(COALESCE(referred.referred_by, referrer.referral_code))),
  'legacy_migration'::referral_attribution_source,
  referred.created_at,
  referred.created_at,
  referred.created_at,
  true,
  true,
  'first_order_pending'::referral_relationship_status,
  'pending',
  0,
  'REFERRAL_APPLIED'::referral_lifecycle_state,
  jsonb_build_object(
    'migrated_from', 'customers.referred_by',
    'grandfathered_at', NOW(),
    'legacy_auto_apply', true,
    'reward_backfilled', false
  ),
  referred.created_at,
  NOW()
FROM public.customers referred
JOIN public.customers referrer
  ON referrer.id = referred.referrer_customer_id
WHERE referred.referrer_customer_id IS NOT NULL
  AND referrer.id <> referred.id
  AND COALESCE(TRIM(referrer.referral_code), '') <> ''
ON CONFLICT (user_type, referred_user_id) DO UPDATE
SET
  -- Do not rewrite active/new relationships; only enrich legacy metadata/code.
  referral_code = CASE
    WHEN referral_relationships.source = 'legacy_migration'
      THEN EXCLUDED.referral_code
    ELSE referral_relationships.referral_code
  END,
  metadata = referral_relationships.metadata || jsonb_build_object(
    'legacy_profile_link_verified', true,
    'legacy_profile_link_verified_at', NOW()
  ),
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 3. Riders: riders.referred_by -> referral_relationships
-- -----------------------------------------------------------------------------
INSERT INTO public.referral_relationships (
  user_type,
  referrer_id,
  referred_user_id,
  referral_code,
  source,
  install_at,
  app_open_at,
  first_open_at,
  auto_applied,
  attribution_consumed,
  status,
  reward_status,
  completed_orders,
  kyc_approved,
  lifecycle_state,
  metadata,
  created_at,
  updated_at
)
SELECT
  'rider'::referral_user_type,
  referrer.id::bigint,
  referred.id::bigint,
  UPPER(TRIM(referrer.referral_code)),
  'legacy_migration'::referral_attribution_source,
  referred.created_at,
  referred.created_at,
  referred.created_at,
  true,
  true,
  'milestone_pending'::referral_relationship_status,
  'pending',
  0,
  CASE
    WHEN UPPER(COALESCE(referred.kyc_status::text, '')) IN ('APPROVED','VERIFIED')
      THEN true
    ELSE false
  END,
  'REFERRAL_APPLIED'::referral_lifecycle_state,
  jsonb_build_object(
    'migrated_from', 'riders.referred_by',
    'grandfathered_at', NOW(),
    'legacy_auto_apply', true,
    'reward_backfilled', false
  ),
  referred.created_at,
  NOW()
FROM public.riders referred
JOIN public.riders referrer ON referrer.id = referred.referred_by
WHERE referred.referred_by IS NOT NULL
  AND referrer.id <> referred.id
  AND COALESCE(TRIM(referrer.referral_code), '') <> ''
ON CONFLICT (user_type, referred_user_id) DO UPDATE
SET
  metadata = referral_relationships.metadata || jsonb_build_object(
    'legacy_profile_link_verified', true,
    'legacy_profile_link_verified_at', NOW()
  ),
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- 4. Lifecycle history for migrated relationships (one event per relationship)
-- -----------------------------------------------------------------------------
UPDATE public.referral_relationships rr
SET campaign_id = c.id,
    updated_at = NOW()
FROM public.referral_campaigns c
WHERE rr.source = 'legacy_migration'
  AND rr.campaign_id IS NULL
  AND c.campaign_code = 'DEFAULT';

INSERT INTO public.referral_lifecycle_events (
  referral_relationship_id,
  referral_code,
  user_type,
  from_state,
  to_state,
  event_name,
  actor,
  metadata,
  created_at
)
SELECT
  rr.id,
  rr.referral_code,
  rr.user_type,
  NULL,
  'REFERRAL_APPLIED'::referral_lifecycle_state,
  'legacy_relationship_backfilled',
  'migration',
  jsonb_build_object(
    'migration', '0474',
    'reward_created', false
  ),
  rr.created_at
FROM public.referral_relationships rr
WHERE rr.source = 'legacy_migration'
  AND NOT EXISTS (
    SELECT 1
    FROM public.referral_lifecycle_events e
    WHERE e.referral_relationship_id = rr.id
      AND e.event_name = 'legacy_relationship_backfilled'
  );

-- -----------------------------------------------------------------------------
-- 5. Funnel history. GREATEST makes reruns idempotent and preserves larger counts.
-- -----------------------------------------------------------------------------
INSERT INTO public.referral_funnel_daily (
  day,
  user_type,
  campaign_id,
  referrals_applied
)
SELECT
  rr.created_at::date,
  rr.user_type,
  rr.campaign_id,
  COUNT(*)::int
FROM public.referral_relationships rr
WHERE rr.source = 'legacy_migration'
  AND rr.campaign_id IS NOT NULL
GROUP BY rr.created_at::date, rr.user_type, rr.campaign_id
ON CONFLICT (day, user_type, campaign_id) DO UPDATE
SET referrals_applied = GREATEST(
      referral_funnel_daily.referrals_applied,
      EXCLUDED.referrals_applied
    );

-- -----------------------------------------------------------------------------
-- 6. Audit + integrity checks
-- -----------------------------------------------------------------------------
INSERT INTO public.referral_configuration_audit (
  action,
  entity_type,
  entity_id,
  old_value,
  new_value,
  reason
)
SELECT
  'legacy_relationships.backfill',
  'referral_relationships',
  '0474',
  NULL,
  jsonb_build_object(
    'customer_relationships',
      COUNT(*) FILTER (WHERE user_type = 'customer'),
    'rider_relationships',
      COUNT(*) FILTER (WHERE user_type = 'rider')
  ),
  'Backfilled old customers.referred_by and riders.referred_by into referral_relationships'
FROM public.referral_relationships
WHERE source = 'legacy_migration'
HAVING NOT EXISTS (
    SELECT 1
    FROM public.referral_configuration_audit a
    WHERE a.action = 'legacy_relationships.backfill'
      AND a.entity_id = '0474'
  );

-- Keep analytics/plans live for connected admin clients.
SELECT public.bump_referral_config_version();

