-- Rollback 0479: remove trigger_fired from prevent_service_logs action check.

ALTER TABLE public.prevent_service_logs
  DROP CONSTRAINT IF EXISTS prevent_service_logs_action_check;

ALTER TABLE public.prevent_service_logs
  ADD CONSTRAINT prevent_service_logs_action_check
  CHECK (action IN (
    'created',
    'updated',
    'paused',
    'resumed',
    'deleted',
    'expired',
    'placement_blocked',
    'dispatch_blocked',
    'acceptance_blocked',
    'signal_bumped',
    'enabled',
    'disabled'
  ));
