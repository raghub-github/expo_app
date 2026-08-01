-- Rollback 0478_prevent_services_audit_actions.sql
-- Reverts action CHECK to the original 0476 set. Rows with newer actions must
-- be deleted (or remapped) first or this will fail.

DELETE FROM public.prevent_service_logs
WHERE action IN (
  'placement_blocked',
  'dispatch_blocked',
  'acceptance_blocked',
  'signal_bumped',
  'enabled',
  'disabled'
);

ALTER TABLE public.prevent_service_logs
  DROP CONSTRAINT IF EXISTS prevent_service_logs_action_check;

ALTER TABLE public.prevent_service_logs
  ADD CONSTRAINT prevent_service_logs_action_check
  CHECK (action IN (
    'created', 'updated', 'paused', 'resumed', 'deleted', 'expired'
  ));
