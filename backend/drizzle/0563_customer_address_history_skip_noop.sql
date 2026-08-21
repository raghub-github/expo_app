-- Customer address history trigger: only log SUBSTANTIVE changes.
--
-- The previous trigger inserted a full snapshot into customer_address_history on
-- EVERY insert/update unconditionally (changed_fields hard-coded to ARRAY[]), so
-- no-op / MRU-churn updates spammed the table. Combined with setAddressLastUsed's
-- old "clear the flag on every row" behaviour, a customer with N saved addresses
-- generated ~N+1 history rows on every location reconcile (app open / foreground /
-- pre-checkout). That is the root cause of customer_address_history bloat
-- (4,300+ rows for 42 saved addresses; one test customer held 3,800+).
--
-- New behaviour:
--   * INSERT  → always logged.
--   * UPDATE  → logged ONLY when a substantive column changed. Pure bookkeeping /
--               usage columns (updated_at, last_used_at, is_last_used, order_count)
--               are excluded from the comparison, and changed_fields is populated
--               with the columns that actually changed.
-- This is purely a logging guard; it does not change customer_addresses data.

CREATE OR REPLACE FUNCTION public.create_customer_address_history()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  old_j   jsonb;
  new_j   jsonb;
  changed text[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Ignore system/usage bookkeeping columns so MRU heartbeats and no-op writes
    -- do not create history rows.
    old_j := (to_jsonb(OLD) - 'updated_at' - 'last_used_at' - 'is_last_used' - 'order_count');
    new_j := (to_jsonb(NEW) - 'updated_at' - 'last_used_at' - 'is_last_used' - 'order_count');

    IF old_j = new_j THEN
      RETURN NEW;  -- nothing substantive changed → do not log
    END IF;

    SELECT array_agg(k ORDER BY k) INTO changed
    FROM jsonb_object_keys(new_j) AS k
    WHERE (new_j -> k) IS DISTINCT FROM (old_j -> k);
  ELSE
    changed := ARRAY[]::text[];
  END IF;

  INSERT INTO customer_address_history (
    address_id, customer_id, address_snapshot, change_type, changed_fields
  ) VALUES (
    NEW.id, NEW.customer_id, row_to_json(NEW)::jsonb, TG_OP,
    COALESCE(changed, ARRAY[]::text[])
  );
  RETURN NEW;
END;
$function$;
