-- Rollback: restore the original unconditional address-history trigger.
CREATE OR REPLACE FUNCTION public.create_customer_address_history()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO customer_address_history (
    address_id, customer_id, address_snapshot, change_type, changed_fields
  ) VALUES (
    NEW.id, NEW.customer_id, row_to_json(NEW)::jsonb, TG_OP, ARRAY[]::TEXT[]
  );
  RETURN NEW;
END;
$function$;
