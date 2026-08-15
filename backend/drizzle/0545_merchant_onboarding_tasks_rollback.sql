-- Rollback 0545: drop onboarding-task table and completion-guard trigger.

DROP TRIGGER IF EXISTS merchant_onboarding_tasks_protect_completion_trg
  ON public.merchant_onboarding_tasks;
DROP FUNCTION IF EXISTS public.merchant_onboarding_tasks_protect_completion();
DROP TABLE IF EXISTS public.merchant_onboarding_tasks;
