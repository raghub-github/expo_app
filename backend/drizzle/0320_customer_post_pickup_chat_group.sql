-- Post-delivery customer support chat — "Customer - Post Delivery" group + default intake titles.
-- Drives the delivered-order support chat option list in customer_app.

BEGIN;

INSERT INTO public.ticket_groups (group_code, group_name, ticket_section, source_role, is_active, display_order)
VALUES
  ('CUST_POST_DELIVERY', 'Customer - Post Delivery', 'customer', 'customer', TRUE, 105)
ON CONFLICT (group_code) DO UPDATE
SET group_name = EXCLUDED.group_name,
    is_active = TRUE;

ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS parent_title_id BIGINT REFERENCES public.ticket_titles (id) ON DELETE SET NULL;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS applicable_order_statuses TEXT[];

WITH g AS (
  SELECT id AS gid FROM public.ticket_groups WHERE group_code = 'CUST_POST_DELIVERY' LIMIT 1
)
INSERT INTO public.ticket_titles
  (title_code, title_text, service_type, ticket_section, source_role, customer_section_id,
   group_id, display_order, is_active, applicable_order_statuses,
   intake_unified_title, intake_unified_category, intake_unified_priority, intake_unified_service_type)
SELECT * FROM (VALUES
  ('CUST_CHAT_SPILLAGE', 'I have a spillage issue with my order', 'food'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'orders', (SELECT gid FROM g), 100, TRUE, ARRAY['delivered']::TEXT[], 'CUSTOMER_DAMAGED_ITEM', 'ORDER', 'HIGH', 'FOOD'),
  ('CUST_CHAT_MISSING', 'Items are missing or incorrect in my order', 'food'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'orders', (SELECT gid FROM g), 110, TRUE, ARRAY['delivered']::TEXT[], 'CUSTOMER_MISSING_ITEM', 'ORDER', 'HIGH', 'FOOD'),
  ('CUST_CHAT_QUALITY', 'I have food taste, quality or quantity issue with my order', 'food'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'orders', (SELECT gid FROM g), 120, TRUE, ARRAY['delivered']::TEXT[], 'CUSTOMER_FOOD_QUALITY', 'ORDER', 'HIGH', 'FOOD'),
  ('CUST_CHAT_QUANTITY', 'The quantity of food is not satisfactory', 'food'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'orders', (SELECT gid FROM g), 130, TRUE, ARRAY['delivered']::TEXT[], 'CUSTOMER_FOOD_QUALITY', 'ORDER', 'HIGH', 'FOOD'),
  ('CUST_CHAT_NOT_RECEIVED', 'I have not received my order', 'food'::ticket_service_type, 'customer'::ticket_section, 'customer'::ticket_source_role, 'orders', (SELECT gid FROM g), 140, TRUE, ARRAY['delivered']::TEXT[], 'CUSTOMER_ORDER_NOT_RECEIVED', 'DELIVERY', 'URGENT', 'FOOD')
) AS v(title_code, title_text, service_type, ticket_section, source_role, customer_section_id,
       group_id, display_order, is_active, applicable_order_statuses,
       intake_unified_title, intake_unified_category, intake_unified_priority, intake_unified_service_type)
ON CONFLICT (title_code) DO UPDATE
SET title_text = EXCLUDED.title_text,
    group_id = EXCLUDED.group_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    applicable_order_statuses = EXCLUDED.applicable_order_statuses,
    intake_unified_title = EXCLUDED.intake_unified_title,
    intake_unified_category = EXCLUDED.intake_unified_category,
    intake_unified_priority = EXCLUDED.intake_unified_priority,
    intake_unified_service_type = EXCLUDED.intake_unified_service_type;

COMMIT;
