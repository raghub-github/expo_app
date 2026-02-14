-- ============================================================================
-- SEED: 30-40 sample tickets for all types, services, sources, groups & titles
-- ============================================================================
-- Target table: public.tickets (enterprise rider/customer ticket system).
-- Prerequisites:
--   - Enums and tables: ticket_service_type, ticket_section, ticket_source_role,
--     ticket_status, ticket_priority, ticket_category; ticket_groups, ticket_titles,
--     ticket_messages, system_users, riders.
--   - At least one rider (tickets.rider_id NOT NULL).
--   - For order_related variety: at least one row in public.orders (order_id FK).
--     If orders is empty, seed still runs but all tickets are non_order/other.
--
-- Covers: order_related / non_order / other; food / parcel / person_ride / other;
-- customer / rider / merchant / system; open / in_progress / resolved / closed;
-- low / medium / high / urgent / critical. Includes sample messages (user + agent).
--
-- After running: Tickets appear in dashboard list; open any TKT-0001-xxxxxx for
-- detail, replies, and task actions (assign, status, priority, etc.).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TICKET GROUPS (order + non-order, customer / rider / merchant)
-- ----------------------------------------------------------------------------
INSERT INTO ticket_groups (
  group_code, group_name, group_description, parent_group_id, group_level,
  display_order, service_type, ticket_section, ticket_category, source_role, is_active
)
VALUES
  ('GRP_CUST_ORDER', 'Customer - Order issues', 'Order-related customer tickets', NULL, 1, 10, 'food', 'customer', 'order_related', 'customer', true),
  ('GRP_CUST_NON', 'Customer - General', 'Non-order customer support', NULL, 1, 20, 'other', 'customer', 'non_order', 'customer', true),
  ('GRP_RIDER_ORDER', 'Rider - Order issues', 'Order-related rider tickets', NULL, 1, 30, 'parcel', 'rider', 'order_related', 'rider', true),
  ('GRP_RIDER_NON', 'Rider - Earnings & app', 'Rider earnings, app, documents', NULL, 1, 40, 'other', 'rider', 'non_order', 'rider', true),
  ('GRP_MERCHANT_ORDER', 'Merchant - Order issues', 'Order-related merchant tickets', NULL, 1, 50, 'food', 'merchant', 'order_related', 'merchant', true),
  ('GRP_MERCHANT_NON', 'Merchant - Payouts & app', 'Merchant payouts and app', NULL, 1, 60, 'other', 'merchant', 'non_order', 'merchant', true),
  ('GRP_SYSTEM', 'System / Other', 'System and other sources', NULL, 1, 70, 'other', 'system', 'other', 'system', true)
ON CONFLICT (group_code) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  ticket_section = EXCLUDED.ticket_section,
  ticket_category = EXCLUDED.ticket_category,
  source_role = EXCLUDED.source_role,
  is_active = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- 2. TICKET TITLES (various titles under each group)
-- ----------------------------------------------------------------------------
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'food', 'customer', 'customer', 'CUST_ORDER_DELAYED', 'Order delayed', 'Food order delivery delayed', 1, true FROM ticket_groups g WHERE g.group_code = 'GRP_CUST_ORDER' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'food', 'customer', 'customer', 'CUST_WRONG_ITEM', 'Wrong item delivered', 'Wrong item in food order', 2, true FROM ticket_groups g WHERE g.group_code = 'GRP_CUST_ORDER' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'parcel', 'customer', 'customer', 'CUST_PARCEL_MISSING', 'Parcel not received', 'Parcel order not received', 3, true FROM ticket_groups g WHERE g.group_code = 'GRP_CUST_ORDER' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'other', 'customer', 'customer', 'CUST_ACCOUNT_ISSUE', 'Account issue', 'Login or account problem', 1, true FROM ticket_groups g WHERE g.group_code = 'GRP_CUST_NON' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'other', 'customer', 'customer', 'CUST_WALLET_ISSUE', 'Wallet / payment issue', 'Wallet or payment method', 2, true FROM ticket_groups g WHERE g.group_code = 'GRP_CUST_NON' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'parcel', 'rider', 'rider', 'RIDER_ORDER_NOT_ASSIGNED', 'Order not assigned', 'Parcel order not assigned to rider', 1, true FROM ticket_groups g WHERE g.group_code = 'GRP_RIDER_ORDER' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'person_ride', 'rider', 'rider', 'RIDER_RIDE_ISSUE', 'Ride assignment issue', 'Ride not received or assignment issue', 2, true FROM ticket_groups g WHERE g.group_code = 'GRP_RIDER_ORDER' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'other', 'rider', 'rider', 'RIDER_EARNINGS_NOT_CREDITED', 'Earnings not credited', 'Earnings or wallet credit issue', 1, true FROM ticket_groups g WHERE g.group_code = 'GRP_RIDER_NON' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'other', 'rider', 'rider', 'RIDER_APP_CRASH', 'App crash or bug', 'Rider app technical issue', 2, true FROM ticket_groups g WHERE g.group_code = 'GRP_RIDER_NON' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'food', 'merchant', 'merchant', 'MERCHANT_ORDER_DELAYED', 'Order delayed / not picked', 'Food order not picked or delayed', 1, true FROM ticket_groups g WHERE g.group_code = 'GRP_MERCHANT_ORDER' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'other', 'merchant', 'merchant', 'MERCHANT_PAYOUT_DELAYED', 'Payout delayed', 'Settlement or payout delayed', 1, true FROM ticket_groups g WHERE g.group_code = 'GRP_MERCHANT_NON' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;
INSERT INTO ticket_titles (group_id, service_type, ticket_section, source_role, title_code, title_text, description, display_order, is_active)
SELECT g.id, 'other', 'system', 'system', 'SYS_OTHER', 'Other / General', 'General or other', 1, true FROM ticket_groups g WHERE g.group_code = 'GRP_SYSTEM' LIMIT 1
ON CONFLICT (title_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. TICKETS (35 tickets: all services, sections, sources, statuses, priorities)
-- Uses: first system_user (assignee), first rider, first order (for order_related only).
-- Prerequisites: at least one rider; for order_related tickets, at least one row in orders.
-- order_id is FK to orders(id) — we use an existing order id when present.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  u_id INT;
  r_id INT;
  o_id BIGINT;
  t_num TEXT;
  tit_id INT;
  t_cat TEXT;
BEGIN
  SELECT id INTO u_id FROM system_users LIMIT 1;
  SELECT id INTO r_id FROM riders LIMIT 1;
  SELECT id INTO o_id FROM orders ORDER BY id LIMIT 1;

  IF r_id IS NULL THEN
    RAISE NOTICE 'No riders in DB - skipping ticket inserts. Add at least one rider first.';
    RETURN;
  END IF;

  FOR i IN 1..35 LOOP
    t_num := 'TKT-0001-' || lpad(i::text, 6, '0');
    t_cat := (ARRAY['order_related','non_order','other'])[1 + ((i-1) % 3)];
    IF t_cat = 'order_related' AND o_id IS NULL THEN
      t_cat := 'non_order';
    END IF;

    SELECT id INTO tit_id FROM ticket_titles
    WHERE is_active = true
    ORDER BY id
    OFFSET ((i - 1) % 12) LIMIT 1;

    INSERT INTO tickets (
      ticket_number, service_type, ticket_category, ticket_section, source_role,
      title_id, subject, description, status, priority,
      order_id, order_service_type, is_3pl_order, is_high_value_order,
      current_assignee_user_id, sla_due_at, resolved_at, closed_at, created_at, updated_at,
      rider_id,
      category,
      message
    )
    VALUES (
      t_num,
      ((ARRAY['food','parcel','person_ride','other'])[1 + ((i-1) % 4)])::ticket_service_type,
      t_cat::ticket_category,
      ((ARRAY['customer','rider','merchant','system'])[1 + ((i-1) % 4)])::ticket_section,
      ((ARRAY['customer','rider','merchant','system'])[1 + ((i-1) % 4)])::ticket_source_role,
      tit_id,
      'Subject for ' || t_num || ' - ' || (ARRAY['Delivery delay','Wrong item','Refund','App issue','Payout','Earnings'])[1 + ((i-1) % 6)],
      'Description: Sample ticket ' || i || ' for testing filters, list, detail and actions.',
      ((ARRAY['open','in_progress','resolved','closed'])[1 + ((i-1) % 4)])::ticket_status,
      ((ARRAY['low','medium','high','urgent','critical'])[1 + ((i-1) % 5)])::ticket_priority,
      CASE WHEN t_cat = 'order_related' THEN o_id ELSE NULL END,
      CASE WHEN t_cat = 'order_related' THEN ((ARRAY['food','parcel','person_ride'])[1 + ((i-1) % 3)])::ticket_service_type ELSE NULL END,
      (i % 7 = 0),
      (i % 5 = 0),
      CASE WHEN i % 4 IN (1,2) THEN u_id ELSE NULL END,
      CASE WHEN i % 4 = 1 THEN NOW() + interval '2 days' ELSE NULL END,
      CASE WHEN (ARRAY['open','in_progress','resolved','closed'])[1 + ((i-1) % 4)] IN ('resolved','closed') THEN NOW() - (i || ' hours')::interval ELSE NULL END,
      CASE WHEN (ARRAY['open','in_progress','resolved','closed'])[1 + ((i-1) % 4)] = 'closed' THEN NOW() - (i || ' hours')::interval ELSE NULL END,
      NOW() - (i * 2 || ' hours')::interval,
      NOW(),
      r_id,
      (ARRAY['order','technical','account','other'])[1 + ((i-1) % 4)],
      'Description: Sample ticket ' || i || ' for testing filters, list, detail and actions.'
    )
    ON CONFLICT (ticket_number) DO NOTHING;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4. TICKET MESSAGES (user-side + agent-side replies for first 20 tickets)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  u_id INT;
  sec TEXT;
BEGIN
  SELECT id INTO u_id FROM system_users LIMIT 1;

  FOR r IN (
    SELECT id, ticket_number FROM tickets WHERE ticket_number LIKE 'TKT-0001-%' ORDER BY id LIMIT 20
  )
  LOOP
    SELECT COALESCE(ticket_section::text, 'customer') INTO sec FROM tickets WHERE id = r.id LIMIT 1;
    IF sec = 'other' THEN sec := 'system'; END IF;

    -- Requester / user message (opening)
    INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message_type, message, created_at, updated_at)
    VALUES (
      r.id,
      sec::ticket_sender_type,
      NULL,
      'reply',
      'Hi, I need help with: ' || r.ticket_number || '. Please look into this.',
      (SELECT created_at FROM tickets WHERE id = r.id),
      NOW()
    );

    -- Agent reply (only if we have an agent)
    IF u_id IS NOT NULL THEN
      INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message_type, message, created_at, updated_at)
      VALUES (
        r.id,
        'agent',
        u_id,
        'reply',
        'Thanks for reaching out. We have received your request and will get back to you shortly. Ticket ref: ' || r.ticket_number,
        (SELECT created_at FROM tickets WHERE id = r.id) + interval '1 hour',
        NOW()
      );
    END IF;

    -- Second user message (follow-up) on odd tickets
    IF r.id % 2 = 1 THEN
      INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, message_type, message, created_at, updated_at)
      VALUES (
        r.id,
        sec::ticket_sender_type,
        NULL,
        'reply',
        'Follow-up: any update on this?',
        (SELECT created_at FROM tickets WHERE id = r.id) + interval '2 hours',
        NOW()
      );
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 5. TICKET PARTICIPANTS (optional: link creator for first 10 tickets)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  u_id INT;
BEGIN
  SELECT id INTO u_id FROM system_users LIMIT 1;
  IF u_id IS NULL THEN RETURN; END IF;
  FOR r IN (SELECT id FROM tickets WHERE ticket_number LIKE 'TKT-0001-%' ORDER BY id LIMIT 10)
  LOOP
    INSERT INTO ticket_participants (ticket_id, participant_role, entity_type, system_user_id)
    VALUES (r.id, 'creator', 'system', u_id);
  END LOOP;
EXCEPTION
  WHEN unique_violation THEN NULL;
  WHEN others THEN NULL;
END $$;

-- Optional: show counts
SELECT 'ticket_groups' AS tbl, COUNT(*) AS cnt FROM ticket_groups
UNION ALL
SELECT 'ticket_titles', COUNT(*) FROM ticket_titles
UNION ALL
SELECT 'tickets', COUNT(*) FROM tickets WHERE ticket_number LIKE 'TKT-0001-%'
UNION ALL
SELECT 'ticket_messages', COUNT(*) FROM ticket_messages tm JOIN tickets t ON t.id = tm.ticket_id WHERE t.ticket_number LIKE 'TKT-0001-%';
