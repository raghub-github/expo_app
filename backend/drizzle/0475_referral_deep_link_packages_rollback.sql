-- Rollback 0475_referral_deep_link_packages.sql
-- Restores the previous (incorrect) rider package. Only useful if the rider app
-- is actually republished under com.gatimitra.rider.

UPDATE public.referral_settings
SET deep_link = jsonb_set(
      COALESCE(deep_link, '{}'::jsonb),
      '{play_store_rider_package}',
      '"com.gatimitra.rider"'::jsonb,
      true
    ),
    updated_at = NOW()
WHERE id = 1
  AND deep_link->>'play_store_rider_package' = 'com.raghubhunia.gatimitrariderapp';

DELETE FROM public.referral_configuration_audit
WHERE action = 'settings.deep_link.fix'
  AND entity_id = '1';

SELECT public.bump_referral_config_version();
