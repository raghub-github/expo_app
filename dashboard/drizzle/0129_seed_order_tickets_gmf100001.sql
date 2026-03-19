-- ============================================================================
-- SEED: Order-related tickets for order GMF100001, customer GM100001
-- ============================================================================
-- Inserts ORDER_RELATED tickets linked to order (formatted_order_id = GMF100001)
-- and customer (customer_id = GM100001). Run after 0128 (unified_tickets FK to orders_core).
-- ============================================================================

DO $$
DECLARE
  o_id BIGINT;
  c_id BIGINT;
  c_name TEXT;
  seq_num INT;
  t_id TEXT;
  titles TEXT[] := ARRAY[
    'ORDER_DELAYED', 'WRONG_ITEM_DELIVERED', 'ITEM_MISSING', 'PAYMENT_ISSUE', 'REFUND_NOT_PROCESSED'
  ];
  statuses TEXT[] := ARRAY['OPEN', 'IN_PROGRESS', 'OPEN', 'RESOLVED', 'CLOSED'];
  priorities TEXT[] := ARRAY['HIGH', 'MEDIUM', 'URGENT', 'MEDIUM', 'LOW'];
  i INT;
BEGIN
  SELECT id INTO o_id FROM public.orders_core WHERE formatted_order_id = 'GMF100001' LIMIT 1;
  SELECT id, full_name INTO c_id, c_name FROM public.customers WHERE customer_id = 'GM100001' LIMIT 1;

  IF o_id IS NULL THEN
    RAISE NOTICE 'Order GMF100001 not found in orders_core. Create the order first or use correct formatted_order_id.';
    RETURN;
  END IF;
  IF c_id IS NULL THEN
    RAISE NOTICE 'Customer GM100001 not found in customers. Create the customer first or use correct customer_id.';
    RETURN;
  END IF;

  FOR i IN 1..5 LOOP
    seq_num := 910000 + i;
    t_id := 'TKT-2026-' || LPAD(seq_num::TEXT, 6, '0');

    INSERT INTO public.unified_tickets (
      ticket_id,
      ticket_type,
      ticket_source,
      service_type,
      ticket_title,
      ticket_category,
      order_id,
      order_type,
      customer_id,
      raised_by_type,
      raised_by_id,
      raised_by_name,
      subject,
      description,
      priority,
      status,
      created_at,
      updated_at
    ) VALUES (
      t_id,
      'ORDER_RELATED'::unified_ticket_type,
      'CUSTOMER'::unified_ticket_source,
      'FOOD'::unified_ticket_service_type,
      titles[i]::unified_ticket_title,
      (CASE titles[i]
        WHEN 'ORDER_DELAYED' THEN 'DELIVERY'::unified_ticket_category
        WHEN 'WRONG_ITEM_DELIVERED' THEN 'ORDER'::unified_ticket_category
        WHEN 'ITEM_MISSING' THEN 'ORDER'::unified_ticket_category
        WHEN 'PAYMENT_ISSUE' THEN 'PAYMENT'::unified_ticket_category
        WHEN 'REFUND_NOT_PROCESSED' THEN 'REFUND'::unified_ticket_category
        ELSE 'ORDER'::unified_ticket_category
      END),
      o_id,
      'food',
      c_id,
      'CUSTOMER'::unified_ticket_source,
      c_id,
      COALESCE(c_name, 'Customer GM100001'),
      'Order GMF100001 – ' || titles[i] || ' (#' || i || ')',
      'Ticket for order GMF100001, customer GM100001. ' || titles[i] || '. Sample description.',
      priorities[i]::unified_ticket_priority,
      statuses[i]::unified_ticket_status,
      NOW() - (i * 3 || ' hours')::INTERVAL,
      NOW()
    )
    ON CONFLICT (ticket_id) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Inserted order-related tickets for order GMF100001, customer GM100001.';
END $$;
