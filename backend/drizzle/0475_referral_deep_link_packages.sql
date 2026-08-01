-- =============================================================================
-- 0475: Correct rider Play Store package in referral deep-link config
-- =============================================================================
-- Safe and idempotent.
--
-- Why:
-- referral_settings.deep_link.play_store_rider_package was seeded as
-- 'com.gatimitra.rider', but the shipped rider app is
-- 'com.raghubhunia.gatimitrariderapp' (apps/gatimitra-riderApp/app.config.js).
-- The referral landing therefore built a Play Store URL for a listing that does
-- not exist, so /rider-ref/<CODE> could never reach the app or the store and the
-- install-referrer payload was lost.
--
-- Only the known-bad value is replaced, so a package deliberately set by Super
-- Admin is left untouched.
-- =============================================================================

UPDATE public.referral_settings
SET deep_link = jsonb_set(
      COALESCE(deep_link, '{}'::jsonb),
      '{play_store_rider_package}',
      '"com.raghubhunia.gatimitrariderapp"'::jsonb,
      true
    ),
    updated_at = NOW()
WHERE id = 1
  AND COALESCE(deep_link->>'play_store_rider_package', '') IN (
    '',
    'com.gatimitra.rider'
  );

-- Make sure the path prefixes the landing pages rely on are present.
UPDATE public.referral_settings
SET deep_link = COALESCE(deep_link, '{}'::jsonb)
      || jsonb_build_object(
           'customer_path_prefix',
             COALESCE(NULLIF(deep_link->>'customer_path_prefix', ''), '/ref'),
           'customer_invite_prefix',
             COALESCE(NULLIF(deep_link->>'customer_invite_prefix', ''), '/invite'),
           'rider_path_prefix',
             COALESCE(NULLIF(deep_link->>'rider_path_prefix', ''), '/rider-ref'),
           'referrer_prefix',
             COALESCE(NULLIF(deep_link->>'referrer_prefix', ''), 'ref_')
         ),
    updated_at = NOW()
WHERE id = 1;

INSERT INTO public.referral_configuration_audit (
  action,
  entity_type,
  entity_id,
  new_value,
  reason
)
SELECT
  'settings.deep_link.fix',
  'referral_settings',
  '1',
  deep_link,
  'Aligned rider Play Store package with the shipped rider app build'
FROM public.referral_settings
WHERE id = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.referral_configuration_audit a
    WHERE a.action = 'settings.deep_link.fix'
      AND a.entity_id = '1'
  );

SELECT public.bump_referral_config_version();
