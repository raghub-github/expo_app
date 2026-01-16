-- ============================================================================
-- UNIFIED TICKET SYSTEM - DATA MIGRATION
-- ============================================================================
-- This migration:
-- 1. Populates ticket_title_config with all fixed titles
-- 2. Migrates existing tickets from old tables to unified_tickets
-- ============================================================================

-- ============================================================================
-- POPULATE TICKET TITLE CONFIGURATION
-- ============================================================================

-- ORDER-RELATED TITLES
INSERT INTO ticket_title_config (ticket_title, display_name, description, applicable_to_ticket_type, applicable_to_service_type, applicable_to_source, default_priority, default_category, display_order) VALUES
('ORDER_DELAYED', 'Order Delayed', 'Order is delayed beyond expected time', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'RIDER', 'MERCHANT', 'SYSTEM']::unified_ticket_source[], 'HIGH', 'DELIVERY', 1),
('ORDER_NOT_RECEIVED', 'Order Not Received', 'Customer did not receive the order', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'SYSTEM']::unified_ticket_source[], 'URGENT', 'DELIVERY', 2),
('WRONG_ITEM_DELIVERED', 'Wrong Item Delivered', 'Wrong item was delivered to customer', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'MERCHANT']::unified_ticket_source[], 'HIGH', 'ORDER', 3),
('ITEM_MISSING', 'Item Missing', 'Some items are missing from the order', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'MERCHANT']::unified_ticket_source[], 'HIGH', 'ORDER', 4),
('ORDER_CANCELLED_WRONG', 'Order Cancelled Wrongly', 'Order was cancelled incorrectly', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'MERCHANT', 'RIDER']::unified_ticket_source[], 'MEDIUM', 'ORDER', 5),
('PAYMENT_ISSUE', 'Payment Issue', 'Payment related issue with the order', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'SYSTEM']::unified_ticket_source[], 'HIGH', 'PAYMENT', 6),
('REFUND_NOT_PROCESSED', 'Refund Not Processed', 'Refund has not been processed', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'SYSTEM']::unified_ticket_source[], 'HIGH', 'REFUND', 7),
('ORDER_DAMAGED', 'Order Damaged', 'Order items were damaged during delivery', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL']::unified_ticket_service_type[], ARRAY['CUSTOMER']::unified_ticket_source[], 'HIGH', 'ORDER', 8),
('ORDER_QUALITY_ISSUE', 'Order Quality Issue', 'Quality of order items is not satisfactory', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD']::unified_ticket_service_type[], ARRAY['CUSTOMER']::unified_ticket_source[], 'MEDIUM', 'ORDER', 9),
('RIDER_NOT_ARRIVED', 'Rider Not Arrived', 'Rider did not arrive for pickup/delivery', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['MERCHANT', 'CUSTOMER', 'SYSTEM']::unified_ticket_source[], 'URGENT', 'DELIVERY', 10),
('RIDER_BEHAVIOUR_ISSUE', 'Rider Behaviour Issue', 'Issue with rider behaviour or conduct', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'MERCHANT']::unified_ticket_source[], 'HIGH', 'COMPLAINT', 11),
('MERCHANT_NOT_PREPARING', 'Merchant Not Preparing', 'Merchant is not preparing the order', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL']::unified_ticket_service_type[], ARRAY['RIDER', 'CUSTOMER', 'SYSTEM']::unified_ticket_source[], 'URGENT', 'ORDER', 12),
('DELIVERY_ADDRESS_WRONG', 'Wrong Delivery Address', 'Delivery address is incorrect', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['RIDER', 'CUSTOMER']::unified_ticket_source[], 'MEDIUM', 'DELIVERY', 13),
('ORDER_NOT_ASSIGNED', 'Order Not Assigned', 'Order has not been assigned to a rider', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['MERCHANT', 'CUSTOMER', 'SYSTEM']::unified_ticket_source[], 'HIGH', 'ORDER', 14),
('ORDER_REASSIGNMENT_NEEDED', 'Order Reassignment Needed', 'Order needs to be reassigned to another rider', ARRAY['ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['MERCHANT', 'CUSTOMER', 'RIDER', 'SYSTEM']::unified_ticket_source[], 'HIGH', 'ORDER', 15),

-- NON-ORDER-RELATED TITLES (CUSTOMER)
('ACCOUNT_ISSUE', 'Account Issue', 'Issue with customer account', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER']::unified_ticket_source[], 'MEDIUM', 'ACCOUNT', 16),
('PAYMENT_METHOD_ISSUE', 'Payment Method Issue', 'Issue with payment method', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER']::unified_ticket_source[], 'MEDIUM', 'PAYMENT', 17),
('WALLET_ISSUE', 'Wallet Issue', 'Issue with customer wallet', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER']::unified_ticket_source[], 'HIGH', 'PAYMENT', 18),
('COUPON_NOT_APPLYING', 'Coupon Not Applying', 'Coupon code is not applying', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['CUSTOMER']::unified_ticket_source[], 'LOW', 'OTHER', 19),
('APP_TECHNICAL_ISSUE', 'App Technical Issue', 'Technical issue with the app', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'RIDER', 'MERCHANT']::unified_ticket_source[], 'MEDIUM', 'TECHNICAL', 20),
('PROFILE_UPDATE_ISSUE', 'Profile Update Issue', 'Issue updating profile information', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER']::unified_ticket_source[], 'LOW', 'ACCOUNT', 21),
('ADDRESS_MANAGEMENT_ISSUE', 'Address Management Issue', 'Issue managing addresses', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER']::unified_ticket_source[], 'LOW', 'ACCOUNT', 22),
('NOTIFICATION_NOT_RECEIVING', 'Not Receiving Notifications', 'Not receiving push notifications', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'RIDER', 'MERCHANT']::unified_ticket_source[], 'LOW', 'TECHNICAL', 23),

-- NON-ORDER-RELATED TITLES (RIDER)
('EARNINGS_NOT_CREDITED', 'Earnings Not Credited', 'Earnings have not been credited to wallet', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['RIDER']::unified_ticket_source[], 'URGENT', 'EARNINGS', 24),
('WALLET_WITHDRAWAL_ISSUE', 'Wallet Withdrawal Issue', 'Issue withdrawing money from wallet', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['RIDER']::unified_ticket_source[], 'HIGH', 'EARNINGS', 25),
('APP_CRASH_OR_BUG', 'App Crash or Bug', 'App is crashing or has bugs', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['RIDER', 'CUSTOMER', 'MERCHANT']::unified_ticket_source[], 'HIGH', 'TECHNICAL', 26),
('LOCATION_TRACKING_ISSUE', 'Location Tracking Issue', 'Issue with location tracking', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['RIDER']::unified_ticket_source[], 'HIGH', 'TECHNICAL', 27),
('RIDER_ORDER_NOT_RECEIVING', 'Not Receiving Orders', 'Not receiving order assignments', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE']::unified_ticket_service_type[], ARRAY['RIDER']::unified_ticket_source[], 'HIGH', 'TECHNICAL', 28),
('ONBOARDING_ISSUE', 'Onboarding Issue', 'Issue during rider onboarding', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['RIDER']::unified_ticket_source[], 'MEDIUM', 'VERIFICATION', 29),
('DOCUMENT_VERIFICATION_ISSUE', 'Document Verification Issue', 'Issue with document verification', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['RIDER']::unified_ticket_source[], 'MEDIUM', 'VERIFICATION', 30),
('DUTY_LOG_ISSUE', 'Duty Log Issue', 'Issue with duty log tracking', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['RIDER']::unified_ticket_source[], 'MEDIUM', 'TECHNICAL', 31),
('RATING_DISPUTE', 'Rating Dispute', 'Dispute regarding ratings received', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['RIDER']::unified_ticket_source[], 'LOW', 'COMPLAINT', 32),

-- NON-ORDER-RELATED TITLES (MERCHANT)
('PAYOUT_DELAYED', 'Payout Delayed', 'Payout is delayed', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['MERCHANT']::unified_ticket_source[], 'URGENT', 'EARNINGS', 33),
('PAYOUT_NOT_RECEIVED', 'Payout Not Received', 'Payout has not been received', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['MERCHANT']::unified_ticket_source[], 'URGENT', 'EARNINGS', 34),
('SETTLEMENT_DISPUTE', 'Settlement Dispute', 'Dispute regarding settlement amount', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['MERCHANT']::unified_ticket_source[], 'HIGH', 'EARNINGS', 35),
('COMMISSION_DISPUTE', 'Commission Dispute', 'Dispute regarding commission charges', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['MERCHANT']::unified_ticket_source[], 'HIGH', 'EARNINGS', 36),
('MENU_UPDATE_ISSUE', 'Menu Update Issue', 'Issue updating menu items', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD']::unified_ticket_service_type[], ARRAY['MERCHANT']::unified_ticket_source[], 'MEDIUM', 'TECHNICAL', 37),
('STORE_STATUS_ISSUE', 'Store Status Issue', 'Issue with store status (open/closed)', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL']::unified_ticket_service_type[], ARRAY['MERCHANT']::unified_ticket_source[], 'MEDIUM', 'TECHNICAL', 38),
('MERCHANT_ORDER_NOT_RECEIVING', 'Not Receiving Orders', 'Merchant not receiving orders', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL']::unified_ticket_service_type[], ARRAY['MERCHANT']::unified_ticket_source[], 'HIGH', 'TECHNICAL', 39),
('MERCHANT_APP_TECHNICAL_ISSUE', 'Merchant App Technical Issue', 'Technical issue with merchant app', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['MERCHANT']::unified_ticket_source[], 'MEDIUM', 'TECHNICAL', 40),
('VERIFICATION_ISSUE', 'Verification Issue', 'Issue with store/merchant verification', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['GENERAL']::unified_ticket_service_type[], ARRAY['MERCHANT']::unified_ticket_source[], 'MEDIUM', 'VERIFICATION', 41),

-- GENERAL TITLES
('OTHER', 'Other', 'Other issues not covered above', ARRAY['ORDER_RELATED', 'NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE', 'GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'RIDER', 'MERCHANT', 'SYSTEM', 'EMAIL']::unified_ticket_source[], 'MEDIUM', 'OTHER', 42),
('FEEDBACK', 'Feedback', 'General feedback', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE', 'GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'RIDER', 'MERCHANT']::unified_ticket_source[], 'LOW', 'FEEDBACK', 43),
('COMPLAINT', 'Complaint', 'General complaint', ARRAY['ORDER_RELATED', 'NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE', 'GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'RIDER', 'MERCHANT']::unified_ticket_source[], 'MEDIUM', 'COMPLAINT', 44),
('SUGGESTION', 'Suggestion', 'Suggestion for improvement', ARRAY['NON_ORDER_RELATED']::unified_ticket_type[], ARRAY['FOOD', 'PARCEL', 'RIDE', 'GENERAL']::unified_ticket_service_type[], ARRAY['CUSTOMER', 'RIDER', 'MERCHANT']::unified_ticket_source[], 'LOW', 'FEEDBACK', 45)
ON CONFLICT (ticket_title) DO NOTHING;

-- ============================================================================
-- MIGRATE EXISTING TICKETS
-- ============================================================================

-- Migrate from old 'tickets' table (rider tickets)
INSERT INTO unified_tickets (
  ticket_id,
  ticket_type,
  ticket_source,
  service_type,
  ticket_title,
  ticket_category,
  order_id,
  rider_id,
  raised_by_type,
  raised_by_id,
  raised_by_name,
  subject,
  description,
  priority,
  status,
  assigned_to_agent_id,
  assigned_at,
  resolution,
  resolved_at,
  created_at,
  updated_at,
  closed_at,
  metadata
)
SELECT 
  'TKT-LEGACY-' || id::TEXT as ticket_id,
  CASE WHEN order_id IS NOT NULL THEN 'ORDER_RELATED'::unified_ticket_type ELSE 'NON_ORDER_RELATED'::unified_ticket_type END,
  'RIDER'::unified_ticket_source,
  'GENERAL'::unified_ticket_service_type, -- Default, can be updated later
  CASE 
    WHEN category ILIKE '%order%' OR category ILIKE '%delivery%' THEN 'ORDER_DELAYED'::unified_ticket_title
    WHEN category ILIKE '%payment%' OR category ILIKE '%earnings%' THEN 'EARNINGS_NOT_CREDITED'::unified_ticket_title
    WHEN category ILIKE '%technical%' OR category ILIKE '%app%' THEN 'APP_TECHNICAL_ISSUE'::unified_ticket_title
    ELSE 'OTHER'::unified_ticket_title
  END,
  CASE 
    WHEN category ILIKE '%order%' THEN 'ORDER'::unified_ticket_category
    WHEN category ILIKE '%payment%' OR category ILIKE '%earnings%' THEN 'EARNINGS'::unified_ticket_category
    WHEN category ILIKE '%technical%' THEN 'TECHNICAL'::unified_ticket_category
    ELSE 'OTHER'::unified_ticket_category
  END,
  order_id,
  rider_id,
  'RIDER'::unified_ticket_source,
  rider_id,
  (SELECT name FROM riders WHERE id = tickets.rider_id LIMIT 1),
  subject,
  message,
  CASE 
    WHEN priority ILIKE '%urgent%' OR priority ILIKE '%critical%' THEN 'URGENT'::unified_ticket_priority
    WHEN priority ILIKE '%high%' THEN 'HIGH'::unified_ticket_priority
    WHEN priority ILIKE '%low%' THEN 'LOW'::unified_ticket_priority
    ELSE 'MEDIUM'::unified_ticket_priority
  END,
  CASE 
    WHEN status = 'open' THEN 'OPEN'::unified_ticket_status
    WHEN status = 'in_progress' THEN 'IN_PROGRESS'::unified_ticket_status
    WHEN status = 'resolved' THEN 'RESOLVED'::unified_ticket_status
    WHEN status = 'closed' THEN 'CLOSED'::unified_ticket_status
    ELSE 'OPEN'::unified_ticket_status
  END,
  assigned_to,
  CASE WHEN assigned_to IS NOT NULL THEN created_at ELSE NULL END,
  resolution,
  resolved_at,
  created_at,
  updated_at,
  CASE WHEN status = 'closed' THEN resolved_at ELSE NULL END,
  metadata
FROM tickets
WHERE NOT EXISTS (
  SELECT 1 FROM unified_tickets WHERE unified_tickets.metadata->>'legacy_ticket_id' = tickets.id::TEXT
)
ON CONFLICT (ticket_id) DO NOTHING;

-- Migrate from 'order_tickets' table
INSERT INTO unified_tickets (
  ticket_id,
  ticket_type,
  ticket_source,
  service_type,
  ticket_title,
  ticket_category,
  order_id,
  customer_id,
  rider_id,
  merchant_store_id,
  raised_by_type,
  raised_by_id,
  raised_by_name,
  subject,
  description,
  attachments,
  priority,
  status,
  assigned_to_agent_id,
  assigned_to_agent_name,
  assigned_at,
  resolution,
  resolved_at,
  resolved_by,
  resolved_by_name,
  follow_up_required,
  follow_up_date,
  created_at,
  updated_at,
  metadata
)
SELECT 
  'TKT-ORDER-' || id::TEXT as ticket_id,
  'ORDER_RELATED'::unified_ticket_type,
  CASE 
    WHEN ticket_source = 'customer' THEN 'CUSTOMER'::unified_ticket_source
    WHEN ticket_source = 'rider' THEN 'RIDER'::unified_ticket_source
    WHEN ticket_source = 'merchant' THEN 'MERCHANT'::unified_ticket_source
    WHEN ticket_source = 'system' THEN 'SYSTEM'::unified_ticket_source
    WHEN ticket_source = 'agent' THEN 'AGENT'::unified_ticket_source
    ELSE 'CUSTOMER'::unified_ticket_source
  END,
  (SELECT order_type::text::unified_ticket_service_type FROM orders WHERE id = order_tickets.order_id LIMIT 1)::unified_ticket_service_type,
  CASE 
    WHEN issue_category ILIKE '%delay%' THEN 'ORDER_DELAYED'::unified_ticket_title
    WHEN issue_category ILIKE '%wrong%' OR issue_category ILIKE '%missing%' THEN 'WRONG_ITEM_DELIVERED'::unified_ticket_title
    WHEN issue_category ILIKE '%payment%' THEN 'PAYMENT_ISSUE'::unified_ticket_title
    WHEN issue_category ILIKE '%refund%' THEN 'REFUND_NOT_PROCESSED'::unified_ticket_title
    WHEN issue_category ILIKE '%rider%' THEN 'RIDER_NOT_ARRIVED'::unified_ticket_title
    ELSE 'OTHER'::unified_ticket_title
  END,
  CASE 
    WHEN issue_category ILIKE '%payment%' THEN 'PAYMENT'::unified_ticket_category
    WHEN issue_category ILIKE '%delivery%' THEN 'DELIVERY'::unified_ticket_category
    WHEN issue_category ILIKE '%refund%' THEN 'REFUND'::unified_ticket_category
    ELSE 'ORDER'::unified_ticket_category
  END,
  order_id,
  (SELECT customer_id FROM orders WHERE id = order_tickets.order_id LIMIT 1),
  (SELECT rider_id FROM orders WHERE id = order_tickets.order_id LIMIT 1),
  (SELECT merchant_store_id FROM orders WHERE id = order_tickets.order_id LIMIT 1),
  CASE 
    WHEN ticket_source = 'customer' THEN 'CUSTOMER'::unified_ticket_source
    WHEN ticket_source = 'rider' THEN 'RIDER'::unified_ticket_source
    WHEN ticket_source = 'merchant' THEN 'MERCHANT'::unified_ticket_source
    WHEN ticket_source = 'system' THEN 'SYSTEM'::unified_ticket_source
    WHEN ticket_source = 'agent' THEN 'AGENT'::unified_ticket_source
    ELSE 'CUSTOMER'::unified_ticket_source
  END,
  raised_by_id,
  COALESCE(raised_by_name, 'Unknown'),
  issue_category || ': ' || COALESCE(issue_subcategory, ''),
  description,
  attachments,
  CASE 
    WHEN priority = 'low' THEN 'LOW'::unified_ticket_priority
    WHEN priority = 'high' THEN 'HIGH'::unified_ticket_priority
    WHEN priority = 'urgent' THEN 'URGENT'::unified_ticket_priority
    WHEN priority = 'critical' THEN 'CRITICAL'::unified_ticket_priority
    ELSE 'MEDIUM'::unified_ticket_priority
  END,
  CASE 
    WHEN status = 'open' THEN 'OPEN'::unified_ticket_status
    WHEN status = 'in_progress' THEN 'IN_PROGRESS'::unified_ticket_status
    WHEN status = 'resolved' THEN 'RESOLVED'::unified_ticket_status
    WHEN status = 'closed' THEN 'CLOSED'::unified_ticket_status
    ELSE 'OPEN'::unified_ticket_status
  END,
  assigned_to_agent_id,
  assigned_to_agent_name,
  assigned_at,
  resolution,
  resolved_at,
  resolved_by,
  resolved_by_name,
  follow_up_required,
  follow_up_date,
  created_at,
  updated_at,
  COALESCE(ticket_metadata, '{}'::jsonb)
FROM order_tickets
WHERE NOT EXISTS (
  SELECT 1 FROM unified_tickets WHERE unified_tickets.metadata->>'legacy_order_ticket_id' = order_tickets.id::TEXT
)
ON CONFLICT (ticket_id) DO NOTHING;

-- Migrate from 'customer_tickets' table
INSERT INTO unified_tickets (
  ticket_id,
  ticket_type,
  ticket_source,
  service_type,
  ticket_title,
  ticket_category,
  order_id,
  customer_id,
  raised_by_type,
  raised_by_id,
  raised_by_name,
  subject,
  description,
  attachments,
  priority,
  status,
  assigned_to_agent_id,
  assigned_to_agent_name,
  assigned_at,
  resolution,
  resolution_time_minutes,
  resolved_at,
  resolved_by,
  follow_up_required,
  follow_up_date,
  satisfaction_rating,
  created_at,
  updated_at,
  metadata
)
SELECT 
  ticket_id,
  CASE WHEN order_id IS NOT NULL THEN 'ORDER_RELATED'::unified_ticket_type ELSE 'NON_ORDER_RELATED'::unified_ticket_type END,
  'CUSTOMER'::unified_ticket_source,
  COALESCE(service_type::text::unified_ticket_service_type, 'GENERAL'::unified_ticket_service_type),
  CASE 
    WHEN issue_category = 'ORDER' THEN 'ORDER_DELAYED'::unified_ticket_title
    WHEN issue_category = 'PAYMENT' THEN 'PAYMENT_METHOD_ISSUE'::unified_ticket_title
    WHEN issue_category = 'DELIVERY' THEN 'ORDER_NOT_RECEIVED'::unified_ticket_title
    WHEN issue_category = 'REFUND' THEN 'REFUND_NOT_PROCESSED'::unified_ticket_title
    WHEN issue_category = 'ACCOUNT' THEN 'ACCOUNT_ISSUE'::unified_ticket_title
    WHEN issue_category = 'TECHNICAL' THEN 'APP_TECHNICAL_ISSUE'::unified_ticket_title
    ELSE 'OTHER'::unified_ticket_title
  END,
  CASE 
    WHEN issue_category = 'ORDER' THEN 'ORDER'::unified_ticket_category
    WHEN issue_category = 'PAYMENT' THEN 'PAYMENT'::unified_ticket_category
    WHEN issue_category = 'DELIVERY' THEN 'DELIVERY'::unified_ticket_category
    WHEN issue_category = 'REFUND' THEN 'REFUND'::unified_ticket_category
    WHEN issue_category = 'ACCOUNT' THEN 'ACCOUNT'::unified_ticket_category
    WHEN issue_category = 'TECHNICAL' THEN 'TECHNICAL'::unified_ticket_category
    ELSE 'OTHER'::unified_ticket_category
  END,
  order_id,
  customer_id,
  'CUSTOMER'::unified_ticket_source,
  customer_id,
  (SELECT full_name FROM customers WHERE id = customer_tickets.customer_id LIMIT 1),
  subject,
  description,
  attachments,
  CASE 
    WHEN priority = 'LOW' THEN 'LOW'::unified_ticket_priority
    WHEN priority = 'HIGH' THEN 'HIGH'::unified_ticket_priority
    WHEN priority = 'URGENT' THEN 'URGENT'::unified_ticket_priority
    WHEN priority = 'CRITICAL' THEN 'CRITICAL'::unified_ticket_priority
    ELSE 'MEDIUM'::unified_ticket_priority
  END,
  CASE 
    WHEN status = 'OPEN' THEN 'OPEN'::unified_ticket_status
    WHEN status = 'IN_PROGRESS' THEN 'IN_PROGRESS'::unified_ticket_status
    WHEN status = 'WAITING_FOR_CUSTOMER' THEN 'WAITING_FOR_USER'::unified_ticket_status
    WHEN status = 'RESOLVED' THEN 'RESOLVED'::unified_ticket_status
    WHEN status = 'CLOSED' THEN 'CLOSED'::unified_ticket_status
    WHEN status = 'ESCALATED' THEN 'ESCALATED'::unified_ticket_status
    ELSE 'OPEN'::unified_ticket_status
  END,
  assigned_to_agent_id,
  assigned_to_agent_name,
  assigned_at,
  resolution,
  resolution_time_minutes,
  resolved_at,
  resolved_by,
  follow_up_required,
  follow_up_date,
  customer_satisfaction_rating,
  created_at,
  updated_at,
  jsonb_build_object('legacy_customer_ticket_id', id)
FROM customer_tickets
WHERE NOT EXISTS (
  SELECT 1 FROM unified_tickets WHERE unified_tickets.ticket_id = customer_tickets.ticket_id
)
ON CONFLICT (ticket_id) DO NOTHING;

-- ============================================================================
-- MIGRATE TICKET MESSAGES
-- ============================================================================

-- Migrate from customer_ticket_messages
INSERT INTO unified_ticket_messages (
  ticket_id,
  message_text,
  message_type,
  sender_type,
  sender_id,
  sender_name,
  attachments,
  is_read,
  read_at,
  created_at
)
SELECT 
  ut.id,
  ctm.message_text,
  COALESCE(ctm.message_type, 'TEXT'),
  CASE 
    WHEN ctm.sender_type = 'CUSTOMER' THEN 'CUSTOMER'::unified_ticket_source
    WHEN ctm.sender_type = 'AGENT' THEN 'AGENT'::unified_ticket_source
    WHEN ctm.sender_type = 'SYSTEM' THEN 'SYSTEM'::unified_ticket_source
    ELSE 'CUSTOMER'::unified_ticket_source
  END,
  ctm.sender_id,
  ctm.sender_name,
  ctm.attachments,
  ctm.is_read,
  ctm.read_at,
  ctm.created_at
FROM customer_ticket_messages ctm
INNER JOIN customer_tickets ct ON ctm.ticket_id = ct.id
INNER JOIN unified_tickets ut ON ut.ticket_id = ct.ticket_id
WHERE NOT EXISTS (
  SELECT 1 FROM unified_ticket_messages utm
  WHERE utm.ticket_id = ut.id
    AND utm.message_text = ctm.message_text
    AND utm.sender_type = CASE 
      WHEN ctm.sender_type = 'CUSTOMER' THEN 'CUSTOMER'::unified_ticket_source
      WHEN ctm.sender_type = 'AGENT' THEN 'AGENT'::unified_ticket_source
      WHEN ctm.sender_type = 'SYSTEM' THEN 'SYSTEM'::unified_ticket_source
      ELSE 'CUSTOMER'::unified_ticket_source
    END
    AND utm.sender_id = ctm.sender_id
    AND utm.created_at = ctm.created_at
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ticket_title_config IS 'Populated with all fixed ticket titles - ensures consistency across platform';
COMMENT ON TABLE unified_tickets IS 'All existing tickets migrated from old tables (tickets, order_tickets, customer_tickets)';
