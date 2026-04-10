-- Allow AND/OR between workflow rule conditions (left-associative).
ALTER TABLE public.ticket_automation_rule_conditions
  ADD COLUMN IF NOT EXISTS combine_with_previous text NOT NULL DEFAULT 'and';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ticket_automation_rule_conditions_combine_check'
      AND conrelid = 'public.ticket_automation_rule_conditions'::regclass
  ) THEN
    ALTER TABLE public.ticket_automation_rule_conditions
      ADD CONSTRAINT ticket_automation_rule_conditions_combine_check
      CHECK (combine_with_previous = ANY (ARRAY['and'::text, 'or'::text]));
  END IF;
END;
$$;

COMMENT ON COLUMN public.ticket_automation_rule_conditions.combine_with_previous IS
  'How this row combines with the result of all prior rows (left-associative). First row ignores this (use and).';
