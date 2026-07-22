-- ─────────────────────────────────────────────────────────────────────────────
-- 0424 · One active penalty per order (prevent multi-apply → multi-revert)
--
-- Rule: at most ONE non-reversed penalty per (rider_id, order_id).
-- Duplicate actives are closed (oldest kept). Closed rows get a wallet credit
-- equal to their amount so the rider is not left double-debited.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
  bal NUMERIC;
  bal_after NUMERIC;
  amt NUMERIC;
  svc TEXT;
  pf NUMERIC; pp NUMERIC; pr NUMERIC;
BEGIN
  FOR r IN
    WITH ranked AS (
      SELECT
        id,
        rider_id,
        order_id,
        amount,
        service_type,
        ROW_NUMBER() OVER (
          PARTITION BY rider_id, order_id
          ORDER BY imposed_at ASC NULLS LAST, id ASC
        ) AS rn
      FROM rider_penalties
      WHERE order_id IS NOT NULL
        AND status IS DISTINCT FROM 'reversed'
    )
    SELECT * FROM ranked WHERE rn > 1
    ORDER BY id
  LOOP
    amt := COALESCE(r.amount, 0);
    svc := COALESCE(NULLIF(TRIM(r.service_type::text), ''), 'parcel');

    -- Mark duplicate reversed (no second revert allowed later)
    UPDATE rider_penalties
    SET
      status = 'reversed',
      resolved_at = COALESCE(resolved_at, NOW()),
      resolution_notes = COALESCE(
        NULLIF(TRIM(resolution_notes), ''),
        'Auto-closed: duplicate active penalty on same order (migration 0424)'
      ),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'duplicate_closed_by_migration', '0424',
        'duplicate_closed_at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    WHERE id = r.id
      AND status IS DISTINCT FROM 'reversed';

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF amt <= 0 THEN
      CONTINUE;
    END IF;

    -- Skip credit if this penalty already has a reversal ledger
    IF EXISTS (
      SELECT 1 FROM wallet_ledger wl
      WHERE wl.rider_id = r.rider_id
        AND wl.ref = 'pen_revert_' || r.id::text
        AND wl.entry_type::text = 'penalty_reversal'
      LIMIT 1
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO rider_wallet (rider_id, total_balance, last_updated_at)
    VALUES (r.rider_id, 0, NOW())
    ON CONFLICT (rider_id) DO NOTHING;

    SELECT
      COALESCE(total_balance, 0),
      COALESCE(penalties_food, 0),
      COALESCE(penalties_parcel, 0),
      COALESCE(penalties_person_ride, 0)
    INTO bal, pf, pp, pr
    FROM rider_wallet
    WHERE rider_id = r.rider_id
    FOR UPDATE;

    bal_after := bal + amt;

    INSERT INTO wallet_ledger (
      rider_id, entry_type, amount, balance, service_type, ref, ref_type,
      description, metadata, performed_by_type, created_at
    ) VALUES (
      r.rider_id,
      'penalty_reversal',
      amt,
      bal_after,
      svc,
      'pen_revert_' || r.id::text,
      'penalty_revert',
      'Penalty Credited Back (duplicate closed by migration 0424)',
      jsonb_build_object(
        'penaltyId', r.id,
        'orderId', r.order_id,
        'migration', '0424'
      ),
      'system',
      NOW()
    );

    UPDATE rider_wallet
    SET
      total_balance = bal_after,
      penalties_food = CASE WHEN svc = 'food' THEN GREATEST(0, pf - amt) ELSE pf END,
      penalties_parcel = CASE WHEN svc = 'parcel' THEN GREATEST(0, pp - amt) ELSE pp END,
      penalties_person_ride = CASE WHEN svc = 'person_ride' THEN GREATEST(0, pr - amt) ELSE pr END,
      last_updated_at = NOW()
    WHERE rider_id = r.rider_id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS rider_penalties_one_active_per_order_uq
  ON rider_penalties (rider_id, order_id)
  WHERE order_id IS NOT NULL
    AND status IS DISTINCT FROM 'reversed';

COMMENT ON INDEX rider_penalties_one_active_per_order_uq IS
  'At most one non-reversed penalty per rider+order — prevents multi-apply / multi-revert.';
