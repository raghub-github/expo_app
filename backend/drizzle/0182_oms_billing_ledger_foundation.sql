-- OMS + Billing + Ledger foundation (additive, migration-safe).
-- Canonical business key remains orders_core.order_id.

-- =========================
-- Order version snapshots
-- =========================
CREATE TABLE IF NOT EXISTS order_version_snapshots (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL,
  version_no integer NOT NULL,
  source text NOT NULL DEFAULT 'finalize_order',
  snapshot jsonb NOT NULL,
  ruleset_version integer,
  hash_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, version_no)
);

CREATE INDEX IF NOT EXISTS order_version_snapshots_order_created_idx
  ON order_version_snapshots(order_id, created_at DESC);

-- =========================
-- Billing decomposition lines
-- =========================
CREATE TABLE IF NOT EXISTS order_charge_lines (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL,
  version_no integer NOT NULL DEFAULT 1,
  line_no integer NOT NULL,
  charge_type text NOT NULL,
  source_rule_id bigint,
  source_slab_id bigint,
  source_tax_config_id bigint,
  base_amount numeric(14,4) NOT NULL DEFAULT 0,
  discount_amount numeric(14,4) NOT NULL DEFAULT 0,
  taxable_amount numeric(14,4) NOT NULL DEFAULT 0,
  tax_amount numeric(14,4) NOT NULL DEFAULT 0,
  final_amount numeric(14,4) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, version_no, line_no)
);

CREATE INDEX IF NOT EXISTS order_charge_lines_order_created_idx
  ON order_charge_lines(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_charge_lines_order_type_idx
  ON order_charge_lines(order_id, charge_type);

CREATE TABLE IF NOT EXISTS order_tax_lines (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL,
  version_no integer NOT NULL DEFAULT 1,
  line_no integer NOT NULL,
  tax_config_id bigint REFERENCES billing_tax_configs(id) ON DELETE SET NULL,
  tax_group text,
  applies_on_component text,
  tax_rate_snapshot numeric(10,6) NOT NULL DEFAULT 0,
  taxable_base_amount numeric(14,4) NOT NULL DEFAULT 0,
  tax_amount numeric(14,4) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, version_no, line_no)
);

CREATE INDEX IF NOT EXISTS order_tax_lines_order_created_idx
  ON order_tax_lines(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_discount_lines (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL,
  version_no integer NOT NULL DEFAULT 1,
  line_no integer NOT NULL,
  discount_type text NOT NULL,
  funding_type text NOT NULL,
  applies_on text,
  source_rule_id bigint,
  source_discount_id bigint,
  amount numeric(14,4) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, version_no, line_no)
);

CREATE INDEX IF NOT EXISTS order_discount_lines_order_created_idx
  ON order_discount_lines(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_bill_summary_versions (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL,
  version_no integer NOT NULL,
  item_total numeric(14,4) NOT NULL DEFAULT 0,
  addon_total numeric(14,4) NOT NULL DEFAULT 0,
  charge_total numeric(14,4) NOT NULL DEFAULT 0,
  discount_total numeric(14,4) NOT NULL DEFAULT 0,
  tax_total numeric(14,4) NOT NULL DEFAULT 0,
  tip_total numeric(14,4) NOT NULL DEFAULT 0,
  donation_total numeric(14,4) NOT NULL DEFAULT 0,
  payable_total numeric(14,4) NOT NULL DEFAULT 0,
  checksum text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, version_no)
);

CREATE INDEX IF NOT EXISTS order_bill_summary_versions_order_created_idx
  ON order_bill_summary_versions(order_id, created_at DESC);

-- =========================
-- Payment / refund lifecycle
-- =========================
CREATE TABLE IF NOT EXISTS payment_intents (
  id bigserial PRIMARY KEY,
  intent_id text NOT NULL UNIQUE,
  order_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  amount numeric(14,4) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_intents_order_created_idx
  ON payment_intents(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id bigserial PRIMARY KEY,
  payment_intent_id bigint NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  gateway text NOT NULL,
  payment_mode text NOT NULL,
  transaction_reference text NOT NULL,
  status text NOT NULL,
  amount numeric(14,4) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  idempotency_key text,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, transaction_reference)
);

CREATE INDEX IF NOT EXISTS payment_transactions_order_status_created_idx
  ON payment_transactions(order_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id bigserial PRIMARY KEY,
  payment_transaction_id bigint NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_reference text,
  amount numeric(14,4) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_allocations_txn_idx
  ON payment_allocations(payment_transaction_id);

CREATE TABLE IF NOT EXISTS refund_intents (
  id bigserial PRIMARY KEY,
  refund_intent_id text NOT NULL UNIQUE,
  order_id text NOT NULL,
  payment_transaction_id bigint REFERENCES payment_transactions(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
  reason text,
  requested_amount numeric(14,4) NOT NULL,
  status text NOT NULL DEFAULT 'created',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refund_intents_order_created_idx
  ON refund_intents(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS refund_transactions (
  id bigserial PRIMARY KEY,
  refund_intent_id bigint NOT NULL REFERENCES refund_intents(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  payment_transaction_id bigint REFERENCES payment_transactions(id) ON DELETE SET NULL,
  gateway text,
  gateway_refund_reference text,
  status text NOT NULL,
  refunded_amount numeric(14,4) NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, gateway_refund_reference)
);

CREATE INDEX IF NOT EXISTS refund_transactions_order_status_created_idx
  ON refund_transactions(order_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS refund_line_items (
  id bigserial PRIMARY KEY,
  refund_transaction_id bigint NOT NULL REFERENCES refund_transactions(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  line_type text NOT NULL,
  reference_line_id bigint,
  amount numeric(14,4) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refund_line_items_txn_idx
  ON refund_line_items(refund_transaction_id);

CREATE TABLE IF NOT EXISTS tax_reversal_lines (
  id bigserial PRIMARY KEY,
  refund_transaction_id bigint NOT NULL REFERENCES refund_transactions(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  original_tax_line_id bigint REFERENCES order_tax_lines(id) ON DELETE SET NULL,
  tax_group text,
  reversal_amount numeric(14,4) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tax_reversal_lines_txn_idx
  ON tax_reversal_lines(refund_transaction_id);

-- =========================
-- Double-entry ledger
-- =========================
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id bigserial PRIMARY KEY,
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL,
  owner_entity_type text NOT NULL,
  owner_entity_id text,
  currency text NOT NULL DEFAULT 'INR',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_accounts_owner_idx
  ON ledger_accounts(owner_entity_type, owner_entity_id);

CREATE TABLE IF NOT EXISTS ledger_journals (
  id bigserial PRIMARY KEY,
  journal_ref text NOT NULL UNIQUE,
  order_id text,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'posted',
  currency text NOT NULL DEFAULT 'INR',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_journals_order_created_idx
  ON ledger_journals(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id bigserial PRIMARY KEY,
  journal_id bigint NOT NULL REFERENCES ledger_journals(id) ON DELETE CASCADE,
  order_id text,
  account_id bigint NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount numeric(14,4) NOT NULL CHECK (amount >= 0),
  entry_no integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_id, entry_no)
);

CREATE INDEX IF NOT EXISTS ledger_entries_account_posted_idx
  ON ledger_entries(account_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_order_posted_idx
  ON ledger_entries(order_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS ledger_references (
  id bigserial PRIMARY KEY,
  journal_id bigint NOT NULL REFERENCES ledger_journals(id) ON DELETE CASCADE,
  reference_type text NOT NULL,
  reference_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_id, reference_type, reference_id)
);

-- =========================
-- Rider assignment events + projection + tracking
-- =========================
CREATE TABLE IF NOT EXISTS order_rider_assignment_events (
  id bigserial PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  order_id text NOT NULL,
  rider_id integer REFERENCES riders(id) ON DELETE SET NULL,
  previous_rider_id integer REFERENCES riders(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('assigned','reassigned','accepted','rejected','unassigned','completed')),
  actor_type text NOT NULL,
  actor_id text,
  reason_code text,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_rider_assignment_events_rider_required_chk CHECK (
    (
      event_type IN ('assigned','reassigned','accepted')
      AND rider_id IS NOT NULL
    )
    OR event_type IN ('rejected','unassigned','completed')
  ),
  UNIQUE (order_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS order_rider_assignment_events_order_created_idx
  ON order_rider_assignment_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_rider_assignment_events_order_rider_created_idx
  ON order_rider_assignment_events(order_id, rider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_rider_assignments_current (
  order_id text PRIMARY KEY,
  rider_id integer NOT NULL REFERENCES riders(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','reassigned','accepted')),
  last_event_id bigint REFERENCES order_rider_assignment_events(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_rider_assignments_current_rider_idx
  ON order_rider_assignments_current(rider_id, status);

CREATE TABLE IF NOT EXISTS rider_tracking_points (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL,
  rider_id integer NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  heading_degrees numeric(5,2),
  speed_kmh numeric(5,2),
  accuracy_meters numeric(6,2),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_tracking_points_order_recorded_idx
  ON rider_tracking_points(order_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS rider_tracking_points_rider_recorded_idx
  ON rider_tracking_points(rider_id, recorded_at DESC);

-- ==========================================================
-- Compatibility-safe FK wiring for orders_core business key
-- Supports environments where canonical order key is `order_id`
-- or older variants where `main_order_id` is present.
-- ==========================================================
DO $$
DECLARE
  v_ref_col text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders_core' AND column_name = 'order_id'
  ) THEN
    v_ref_col := 'order_id';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders_core' AND column_name = 'main_order_id'
  ) THEN
    v_ref_col := 'main_order_id';
  ELSE
    v_ref_col := NULL;
  END IF;

  IF v_ref_col IS NULL THEN
    RAISE NOTICE 'orders_core business key column not found (`order_id`/`main_order_id`); skipping FK attachment';
    RETURN;
  END IF;

  BEGIN
    EXECUTE format(
      'ALTER TABLE order_version_snapshots ADD CONSTRAINT order_version_snapshots_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip order_version_snapshots fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE order_charge_lines ADD CONSTRAINT order_charge_lines_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip order_charge_lines fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE order_tax_lines ADD CONSTRAINT order_tax_lines_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip order_tax_lines fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE order_discount_lines ADD CONSTRAINT order_discount_lines_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip order_discount_lines fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE order_bill_summary_versions ADD CONSTRAINT order_bill_summary_versions_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip order_bill_summary_versions fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE payment_intents ADD CONSTRAINT payment_intents_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip payment_intents fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip payment_transactions fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE refund_intents ADD CONSTRAINT refund_intents_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip refund_intents fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE refund_transactions ADD CONSTRAINT refund_transactions_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip refund_transactions fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE refund_line_items ADD CONSTRAINT refund_line_items_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip refund_line_items fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE tax_reversal_lines ADD CONSTRAINT tax_reversal_lines_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip tax_reversal_lines fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE ledger_journals ADD CONSTRAINT ledger_journals_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE SET NULL',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip ledger_journals fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE SET NULL',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip ledger_entries fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE order_rider_assignment_events ADD CONSTRAINT order_rider_assignment_events_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip order_rider_assignment_events fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE order_rider_assignments_current ADD CONSTRAINT order_rider_assignments_current_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip order_rider_assignments_current fk: %', SQLERRM;
  END;
  BEGIN
    EXECUTE format(
      'ALTER TABLE rider_tracking_points ADD CONSTRAINT rider_tracking_points_order_fkey FOREIGN KEY (order_id) REFERENCES orders_core(%I) ON DELETE CASCADE',
      v_ref_col
    );
  EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN RAISE NOTICE 'skip rider_tracking_points fk: %', SQLERRM;
  END;
END $$;
