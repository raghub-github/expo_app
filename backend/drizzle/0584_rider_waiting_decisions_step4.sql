-- Rider Waiting Decision (Step 4) — tracks the "continue / cancel" prompt loop for a rider
-- waiting past the decision threshold. Non-response NEVER auto-cancels: the prompt is re-asked
-- every 10 min for up to 30 min, then prompting stops (stopped_at) and ops/merchant escalation
-- takes over. One row per order; idempotent prompt bookkeeping.

CREATE TABLE IF NOT EXISTS rider_waiting_decisions (
  order_id        bigint PRIMARY KEY REFERENCES orders_core(id) ON DELETE CASCADE,
  rider_id        integer,
  prompts_sent    integer NOT NULL DEFAULT 0,
  first_prompt_at timestamptz,
  last_prompt_at  timestamptz,
  -- 'continue' (rider agrees to wait more) | 'cancel' (rider opts out) | NULL (undecided)
  decision        text,
  decided_at      timestamptz,
  -- set once we stop re-asking (30-min window elapsed with no decision)
  stopped_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE rider_waiting_decisions
    ADD CONSTRAINT rider_waiting_decisions_decision_chk
    CHECK (decision IS NULL OR decision IN ('continue', 'cancel'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
