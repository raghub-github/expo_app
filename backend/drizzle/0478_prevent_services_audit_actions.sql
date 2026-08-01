-- =============================================================================
-- 0478: Prevent Services — expand audit log actions for runtime events
-- =============================================================================
-- Adds placement / dispatch / acceptance blocked + signal bump actions so
-- production debugging can see both admin lifecycle and enforcement hits.
-- Idempotent.
-- =============================================================================

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

COMMENT ON CONSTRAINT prevent_service_logs_action_check ON public.prevent_service_logs IS
  'Admin lifecycle + runtime enforcement audit actions for Prevent Services.';
