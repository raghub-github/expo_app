-- Rollback 0474_legacy_referral_relationships_backfill.sql
--
-- Safety: only removes profile-derived relationships that have never produced a
-- reward transaction/job. Existing profile referred_by/referrer_customer_id data
-- is preserved. Relationships already used by the live engine are preserved.

DELETE FROM public.referral_relationships rr
WHERE rr.source = 'legacy_migration'
  AND rr.metadata->>'migrated_from' IN (
    'customers.referred_by',
    'riders.referred_by'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.referral_reward_transactions tx
    WHERE tx.referral_relationship_id = rr.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.referral_reward_jobs job
    WHERE job.referral_relationship_id = rr.id
  );

DELETE FROM public.referral_configuration_audit
WHERE action = 'legacy_relationships.backfill'
  AND entity_id = '0474';

-- Funnel rows may contain events from outside this migration, so do not delete
-- or decrement them destructively. A reporting rebuild may recalculate them.

SELECT public.bump_referral_config_version();

