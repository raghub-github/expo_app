-- Rollback 0637: clear group assignment on matching open tickets, then remove
-- the seeded title + group. Does not drop unified_tickets.group_id (shared column).

SET lock_timeout = '3s';
SET statement_timeout = '30s';

BEGIN;

UPDATE public.unified_tickets ut
SET
  group_id = NULL,
  updated_at = NOW()
FROM public.ticket_groups g
WHERE g.group_code = 'RIDER_ONBOARDING_PENDING'
  AND ut.group_id = g.id
  AND (
    ut.subject = 'Onboarding Verification Pending'
    OR COALESCE(ut.metadata->>'onboarding_verification_pending', '') = 'true'
    OR COALESCE(ut.metadata->'rider_help'->>'title_code', '') = 'ONBOARDING_VERIFICATION_PENDING'
    OR (
      ut.tags IS NOT NULL
      AND 'onboarding_verification_pending' = ANY (ut.tags)
    )
  );

DELETE FROM public.ticket_titles
WHERE title_code = 'ONBOARDING_VERIFICATION_PENDING';

DELETE FROM public.ticket_groups
WHERE group_code = 'RIDER_ONBOARDING_PENDING';

COMMIT;
