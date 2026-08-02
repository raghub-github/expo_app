-- =============================================================================
-- 0479: Prevent Services — add trigger_fired audit action
-- =============================================================================
-- Logs when an active rule first engages (enforcement hit) or is activated.
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
    'disabled',
    'trigger_fired'
  ));

COMMENT ON CONSTRAINT prevent_service_logs_action_check ON public.prevent_service_logs IS
  'Admin lifecycle + runtime enforcement audit actions for Prevent Services.';
