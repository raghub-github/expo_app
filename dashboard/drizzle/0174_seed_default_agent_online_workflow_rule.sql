-- Seed one persisted workflow rule for trigger agent_went_online so auto-assign / queue balance
-- on "agent comes online" appears under Manager → Automations → Agent online.
-- Safe to re-run: idempotent via ON CONFLICT (rule_code) and missing child-row checks.
--
-- Apply after: 0166, 0169, 0170 (agent triggers on rules CHECK).

DO $$
DECLARE
  rid bigint;
BEGIN
  IF to_regclass('public.ticket_automation_rules') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.ticket_automation_rules (
    rule_code,
    rule_name,
    rule_description,
    rule_priority,
    trigger_event,
    is_enabled,
    is_active,
    once_per_ticket,
    stop_after_match,
    execution_mode,
    execution_delay_seconds,
    max_action_retries,
    version,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    'default_agent_online_queue_balance',
    'After agent comes online: run queue balance',
    'System-seeded rule (migration 0174). Runs queue balance for this agent''s groups when they switch to Online so unassigned work can auto-assign to them (and groups rebalance). Edit, disable, or delete in Automations → Agent online.',
    25,
    'agent_went_online',
    true,
    true,
    false,
    false,
    'immediate',
    0,
    2,
    1,
    NULL,
    NULL
  )
  ON CONFLICT (rule_code) DO NOTHING
  RETURNING id
  INTO rid;

  IF rid IS NULL THEN
    SELECT r.id
    INTO rid
    FROM public.ticket_automation_rules r
    WHERE r.rule_code = 'default_agent_online_queue_balance'
    LIMIT 1;
  END IF;

  IF rid IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ticket_automation_rule_conditions c WHERE c.rule_id = rid LIMIT 1
  ) THEN
    INSERT INTO public.ticket_automation_rule_conditions (
      rule_id,
      sort_order,
      field,
      operator,
      value,
      combine_with_previous
    )
    VALUES (
      rid,
      0,
      'is_online',
      'eq',
      'true'::jsonb,
      'and'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ticket_automation_rule_actions a WHERE a.rule_id = rid LIMIT 1
  ) THEN
    INSERT INTO public.ticket_automation_rule_actions (rule_id, sort_order, action_type, payload)
    VALUES (rid, 0, 'run_queue_balance_for_agent', '{}'::jsonb);
  END IF;
END;
$$;
