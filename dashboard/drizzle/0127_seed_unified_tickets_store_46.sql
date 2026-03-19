-- ============================================================================
-- SEED: Dummy unified_tickets for store 46 (Pratap Ki Duniya)
-- ============================================================================
-- Inserts 10 sample tickets: MERCHANT source, merchant_store_id = 46,
-- NON_ORDER_RELATED, mixed status/priority and merchant-relevant titles.
-- Run after: 0020 (unified_tickets), 0050 (order_type), 0126 (order_check fix).
-- ============================================================================

DO $$
DECLARE
  store_id BIGINT := 46;
  parent_id BIGINT;
  seq_num INT;
  t_id TEXT;
  titles TEXT[] := ARRAY[
    'MENU_UPDATE_ISSUE', 'PAYOUT_DELAYED', 'PAYOUT_NOT_RECEIVED',
    'SETTLEMENT_DISPUTE', 'COMMISSION_DISPUTE', 'STORE_STATUS_ISSUE',
    'MERCHANT_APP_TECHNICAL_ISSUE', 'VERIFICATION_ISSUE', 'OTHER', 'FEEDBACK'
  ];
  statuses TEXT[] := ARRAY['OPEN', 'OPEN', 'IN_PROGRESS', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'RESOLVED', 'CLOSED', 'CLOSED', 'CLOSED'];
  priorities TEXT[] := ARRAY['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM', 'LOW', 'MEDIUM', 'HIGH'];
  categories TEXT[] := ARRAY['TECHNICAL', 'EARNINGS', 'EARNINGS', 'EARNINGS', 'ORDER', 'OTHER', 'TECHNICAL', 'VERIFICATION', 'OTHER', 'FEEDBACK'];
  i INT;
BEGIN
  SELECT parent_id INTO parent_id FROM merchant_stores WHERE id = store_id LIMIT 1;

  FOR i IN 1..10 LOOP
    seq_num := 900000 + i;
    t_id := 'TKT-2026-' || LPAD(seq_num::TEXT, 6, '0');

    INSERT INTO public.unified_tickets (
      ticket_id,
      ticket_type,
      ticket_source,
      service_type,
      ticket_title,
      ticket_category,
      merchant_store_id,
      merchant_parent_id,
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
      'NON_ORDER_RELATED'::unified_ticket_type,
      'MERCHANT'::unified_ticket_source,
      (CASE WHEN i % 3 = 0 THEN 'FOOD'::unified_ticket_service_type ELSE 'GENERAL'::unified_ticket_service_type END),
      titles[i]::unified_ticket_title,
      categories[i]::unified_ticket_category,
      store_id,
      parent_id,
      'MERCHANT'::unified_ticket_source,
      store_id,
      'Pratap Ki Duniya',
      'Pratap Ki Duniya – ' || titles[i] || ' (#' || i || ')',
      'Dummy ticket for store Pratap Ki Duniya. ' || titles[i] || '. Sample description for testing list and detail views.',
      priorities[i]::unified_ticket_priority,
      statuses[i]::unified_ticket_status,
      NOW() - (i * 2 || ' hours')::INTERVAL,
      NOW()
    )
    ON CONFLICT (ticket_id) DO NOTHING;
  END LOOP;
END $$;
