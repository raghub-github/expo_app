-- Seed five example workflow rules (one per Automations tab / trigger), with conditions + actions.
-- Idempotent: ON CONFLICT (rule_code) DO NOTHING; child rows only if missing.
--
-- Requires: 0166 (tables), 0169 (combine_with_previous), 0170 (agent offline trigger),
--           0175 (ticket_reopened on rules CHECK).

DO $$
DECLARE
  rid bigint;
BEGIN
  IF to_regclass('public.ticket_automation_rules') IS NULL THEN
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1) New ticket — auto-assign least busy when still unassigned
  -- ---------------------------------------------------------------------------
  rid := NULL;
  INSERT INTO public.ticket_automation_rules (
    rule_code, rule_name, rule_description, rule_priority, trigger_event,
    is_enabled, is_active, once_per_ticket, stop_after_match,
    execution_mode, execution_delay_seconds, max_action_retries, version,
    created_by_user_id, updated_by_user_id
  )
  VALUES (
    'seed_m0176_ticket_created',
    'New ticket: auto-assign if unassigned',
    'Seeded by migration 0176. Runs on ticket_created when no assignee yet; action assign_least_loaded.',
    20,
    'ticket_created',
    true, true, false, false,
    'immediate', 0, 2, 1,
    NULL, NULL
  )
  ON CONFLICT (rule_code) DO NOTHING
  RETURNING id INTO rid;

  IF rid IS NULL THEN
    SELECT r.id INTO rid FROM public.ticket_automation_rules r WHERE r.rule_code = 'seed_m0176_ticket_created' LIMIT 1;
  END IF;

  IF rid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_conditions c WHERE c.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_conditions (
        rule_id, sort_order, field, operator, value, combine_with_previous
      ) VALUES (
        rid, 0, 'assigned_to_agent_id', 'is_null', 'null'::jsonb, 'and'
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_actions a WHERE a.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_actions (rule_id, sort_order, action_type, payload)
      VALUES (rid, 0, 'assign_least_loaded', '{}'::jsonb);
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2) Ticket updated — same pattern on updates
  -- ---------------------------------------------------------------------------
  rid := NULL;
  INSERT INTO public.ticket_automation_rules (
    rule_code, rule_name, rule_description, rule_priority, trigger_event,
    is_enabled, is_active, once_per_ticket, stop_after_match,
    execution_mode, execution_delay_seconds, max_action_retries, version,
    created_by_user_id, updated_by_user_id
  )
  VALUES (
    'seed_m0176_ticket_updated',
    'Ticket updated: auto-assign if unassigned',
    'Seeded by migration 0176. Runs on ticket_updated when assignee is still empty.',
    18,
    'ticket_updated',
    true, true, false, false,
    'immediate', 0, 2, 1,
    NULL, NULL
  )
  ON CONFLICT (rule_code) DO NOTHING
  RETURNING id INTO rid;

  IF rid IS NULL THEN
    SELECT r.id INTO rid FROM public.ticket_automation_rules r WHERE r.rule_code = 'seed_m0176_ticket_updated' LIMIT 1;
  END IF;

  IF rid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_conditions c WHERE c.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_conditions (
        rule_id, sort_order, field, operator, value, combine_with_previous
      ) VALUES (
        rid, 0, 'assigned_to_agent_id', 'is_null', 'null'::jsonb, 'and'
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_actions a WHERE a.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_actions (rule_id, sort_order, action_type, payload)
      VALUES (rid, 0, 'assign_least_loaded', '{}'::jsonb);
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3) Ticket reopened — auto-assign if unassigned
  -- ---------------------------------------------------------------------------
  rid := NULL;
  INSERT INTO public.ticket_automation_rules (
    rule_code, rule_name, rule_description, rule_priority, trigger_event,
    is_enabled, is_active, once_per_ticket, stop_after_match,
    execution_mode, execution_delay_seconds, max_action_retries, version,
    created_by_user_id, updated_by_user_id
  )
  VALUES (
    'seed_m0176_ticket_reopened',
    'Ticket reopened: auto-assign if unassigned',
    'Seeded by migration 0176. Runs on ticket_reopened (back to open from resolved/closed) when no assignee.',
    22,
    'ticket_reopened',
    true, true, false, false,
    'immediate', 0, 2, 1,
    NULL, NULL
  )
  ON CONFLICT (rule_code) DO NOTHING
  RETURNING id INTO rid;

  IF rid IS NULL THEN
    SELECT r.id INTO rid FROM public.ticket_automation_rules r WHERE r.rule_code = 'seed_m0176_ticket_reopened' LIMIT 1;
  END IF;

  IF rid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_conditions c WHERE c.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_conditions (
        rule_id, sort_order, field, operator, value, combine_with_previous
      ) VALUES (
        rid, 0, 'assigned_to_agent_id', 'is_null', 'null'::jsonb, 'and'
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_actions a WHERE a.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_actions (rule_id, sort_order, action_type, payload)
      VALUES (rid, 0, 'assign_least_loaded', '{}'::jsonb);
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4) Agent online — queue balance for returning agent
  -- ---------------------------------------------------------------------------
  rid := NULL;
  INSERT INTO public.ticket_automation_rules (
    rule_code, rule_name, rule_description, rule_priority, trigger_event,
    is_enabled, is_active, once_per_ticket, stop_after_match,
    execution_mode, execution_delay_seconds, max_action_retries, version,
    created_by_user_id, updated_by_user_id
  )
  VALUES (
    'seed_m0176_agent_online',
    'Agent online: run queue balance (seed)',
    'Seeded by migration 0176. Same pattern as default online rule; rebalance groups for the agent when they go online.',
    15,
    'agent_went_online',
    true, true, false, false,
    'immediate', 0, 2, 1,
    NULL, NULL
  )
  ON CONFLICT (rule_code) DO NOTHING
  RETURNING id INTO rid;

  IF rid IS NULL THEN
    SELECT r.id INTO rid FROM public.ticket_automation_rules r WHERE r.rule_code = 'seed_m0176_agent_online' LIMIT 1;
  END IF;

  IF rid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_conditions c WHERE c.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_conditions (
        rule_id, sort_order, field, operator, value, combine_with_previous
      ) VALUES (
        rid, 0, 'is_online', 'eq', 'true'::jsonb, 'and'
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_actions a WHERE a.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_actions (rule_id, sort_order, action_type, payload)
      VALUES (rid, 0, 'run_queue_balance_for_agent', '{}'::jsonb);
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5) Agent offline — queue balance after full offline
  -- ---------------------------------------------------------------------------
  rid := NULL;
  INSERT INTO public.ticket_automation_rules (
    rule_code, rule_name, rule_description, rule_priority, trigger_event,
    is_enabled, is_active, once_per_ticket, stop_after_match,
    execution_mode, execution_delay_seconds, max_action_retries, version,
    created_by_user_id, updated_by_user_id
  )
  VALUES (
    'seed_m0176_agent_offline',
    'Agent offline: run queue balance (seed)',
    'Seeded by migration 0176. Rebalance for the agent context when trigger fires (alongside any built-in release settings).',
    15,
    'agent_went_offline',
    true, true, false, false,
    'immediate', 0, 2, 1,
    NULL, NULL
  )
  ON CONFLICT (rule_code) DO NOTHING
  RETURNING id INTO rid;

  IF rid IS NULL THEN
    SELECT r.id INTO rid FROM public.ticket_automation_rules r WHERE r.rule_code = 'seed_m0176_agent_offline' LIMIT 1;
  END IF;

  IF rid IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_conditions c WHERE c.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_conditions (
        rule_id, sort_order, field, operator, value, combine_with_previous
      ) VALUES (
        rid, 0, 'is_online', 'eq', 'false'::jsonb, 'and'
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ticket_automation_rule_actions a WHERE a.rule_id = rid LIMIT 1) THEN
      INSERT INTO public.ticket_automation_rule_actions (rule_id, sort_order, action_type, payload)
      VALUES (rid, 0, 'run_queue_balance_for_agent', '{}'::jsonb);
    END IF;
  END IF;
END;
$$;
