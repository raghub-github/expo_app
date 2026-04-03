-- AND / OR / IF between workflow rule actions (first row ignores combine; left-associative chain).
ALTER TABLE public.ticket_automation_rule_actions
  ADD COLUMN IF NOT EXISTS combine_with_previous text NOT NULL DEFAULT 'and';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_automation_rule_actions_combine_check'
      AND conrelid = 'public.ticket_automation_rule_actions'::regclass
  ) THEN
    ALTER TABLE public.ticket_automation_rule_actions
      ADD CONSTRAINT ticket_automation_rule_actions_combine_check
      CHECK (combine_with_previous = ANY (ARRAY['and'::text, 'or'::text, 'if'::text]));
  END IF;
END;
$$;

COMMENT ON COLUMN public.ticket_automation_rule_actions.combine_with_previous IS
  'How this row combines with the last *executed* prior action. and=always run; or=run only if previous action failed; if=run only if previous succeeded. First row ignores this.';
