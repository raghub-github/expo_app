-- 0274: Customer-facing ride (person_ride) ticket catalog.
--
-- WHY:
--   Order-detail "Need help?" for rides was showing food titles (refund, missing
--   item, etc.) because the customer catalog only had food + general rows.
--   Ride orders need their own group, tags, and status-mapped titles.
--
-- WHAT:
--   1. Add unified_ticket_title enum values for ride intake.
--   2. Seed CUST_RIDE group, ride tags, and Rapido-style ride titles.
--   3. Map titles to ride-relevant order statuses (lowercase — matches
--      customer-support /help-sections filter normalization).

BEGIN;

-- ---------- (A) Ride enum values for unified_tickets.ticket_title ----------------

ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_RIDE_CANCELLATION_FEE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_RIDE_SAFETY_CONCERN';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_RIDE_CAPTAIN_ISSUE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_RIDE_REFUND_REQUEST';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_RIDE_REFUND_STATUS';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_RIDE_FARE_ISSUE';
ALTER TYPE unified_ticket_title ADD VALUE IF NOT EXISTS 'CUSTOMER_RIDE_OTHER';

-- ---------- (B) Ride support group ------------------------------------------------

INSERT INTO public.ticket_groups (group_code, group_name, ticket_section, source_role, is_active, display_order)
VALUES
  ('CUST_RIDE', 'Customer · Rides', 'customer', 'customer', TRUE, 105)
ON CONFLICT (group_code) DO NOTHING;

-- ---------- (C) Ride tags -------------------------------------------------------

INSERT INTO public.ticket_tags (tag_code, tag_name, tag_color, is_active)
VALUES
  ('CUST_RIDE_CANCEL',   'Ride Cancellation', '#dc2626', TRUE),
  ('CUST_RIDE_SAFETY',   'Ride Safety',       '#b91c1c', TRUE),
  ('CUST_RIDE_CAPTAIN',  'Captain Issue',     '#0ea5e9', TRUE),
  ('CUST_RIDE_REFUND',   'Ride Refund',       '#16a34a', TRUE),
  ('CUST_RIDE_FARE',     'Fare Issue',        '#f59e0b', TRUE)
ON CONFLICT (tag_code) DO NOTHING;

-- ---------- (D) Ride titles -----------------------------------------------------

ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_title         TEXT;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_category      TEXT;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_priority      TEXT;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_service_type  TEXT;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS applicable_order_statuses TEXT[];

WITH g AS (
  SELECT (SELECT id FROM public.ticket_groups WHERE group_code = 'CUST_RIDE') AS gid_ride
)
INSERT INTO public.ticket_titles
  (title_code, title_text, service_type, ticket_section, source_role, customer_section_id,
   group_id, display_order, is_active,
   intake_unified_title, intake_unified_category, intake_unified_priority, intake_unified_service_type,
   applicable_order_statuses)
SELECT * FROM (VALUES
  (
    'CUST_RIDE_CANCEL_FEE',
    'I have been charged cancellation fee',
    'person_ride'::ticket_service_type,
    'customer'::ticket_section,
    'customer'::ticket_source_role,
    'rides',
    (SELECT gid_ride FROM g),
    100,
    TRUE,
    'CUSTOMER_RIDE_CANCELLATION_FEE',
    'REFUND',
    'HIGH',
    'RIDE',
    ARRAY['cancelled','failed']::TEXT[]
  ),
  (
    'CUST_RIDE_SAFETY',
    'I had a safety concern in my ride',
    'person_ride'::ticket_service_type,
    'customer'::ticket_section,
    'customer'::ticket_source_role,
    'rides',
    (SELECT gid_ride FROM g),
    110,
    TRUE,
    'CUSTOMER_RIDE_SAFETY_CONCERN',
    'COMPLAINT',
    'CRITICAL',
    'RIDE',
    ARRAY[
      'searching_rider','rider_assigned','accepted','assigned','reached_store',
      'picked_up','in_transit','ride_in_progress','delivered','cancelled','failed'
    ]::TEXT[]
  ),
  (
    'CUST_RIDE_CAPTAIN',
    'I want to report an issue about the captain or ride',
    'person_ride'::ticket_service_type,
    'customer'::ticket_section,
    'customer'::ticket_source_role,
    'rides',
    (SELECT gid_ride FROM g),
    120,
    TRUE,
    'CUSTOMER_RIDE_CAPTAIN_ISSUE',
    'COMPLAINT',
    'HIGH',
    'RIDE',
    ARRAY[
      'rider_assigned','accepted','assigned','reached_store',
      'picked_up','in_transit','ride_in_progress','delivered','cancelled'
    ]::TEXT[]
  ),
  (
    'CUST_RIDE_REFUND',
    'Refund for this ride',
    'person_ride'::ticket_service_type,
    'customer'::ticket_section,
    'customer'::ticket_source_role,
    'rides',
    (SELECT gid_ride FROM g),
    130,
    TRUE,
    'CUSTOMER_RIDE_REFUND_REQUEST',
    'REFUND',
    'HIGH',
    'RIDE',
    ARRAY['delivered','cancelled','failed']::TEXT[]
  ),
  (
    'CUST_RIDE_REFUND_STATUS',
    'Where is my refund?',
    'person_ride'::ticket_service_type,
    'customer'::ticket_section,
    'customer'::ticket_source_role,
    'rides',
    (SELECT gid_ride FROM g),
    140,
    TRUE,
    'CUSTOMER_RIDE_REFUND_STATUS',
    'REFUND',
    'HIGH',
    'RIDE',
    ARRAY['delivered','cancelled','failed']::TEXT[]
  ),
  (
    'CUST_RIDE_FARE',
    'Incorrect fare charged',
    'person_ride'::ticket_service_type,
    'customer'::ticket_section,
    'customer'::ticket_source_role,
    'rides',
    (SELECT gid_ride FROM g),
    150,
    TRUE,
    'CUSTOMER_RIDE_FARE_ISSUE',
    'PAYMENT',
    'HIGH',
    'RIDE',
    ARRAY['delivered','cancelled','failed']::TEXT[]
  ),
  (
    'CUST_RIDE_OTHER',
    'Other issues',
    'person_ride'::ticket_service_type,
    'customer'::ticket_section,
    'customer'::ticket_source_role,
    'rides',
    (SELECT gid_ride FROM g),
    160,
    TRUE,
    'CUSTOMER_RIDE_OTHER',
    'OTHER',
    'LOW',
    'RIDE',
    NULL::TEXT[]
  )
) AS v(
  title_code, title_text, service_type, ticket_section, source_role, customer_section_id,
  group_id, display_order, is_active,
  intake_unified_title, intake_unified_category, intake_unified_priority, intake_unified_service_type,
  applicable_order_statuses
)
ON CONFLICT (title_code) DO UPDATE SET
  title_text = EXCLUDED.title_text,
  service_type = EXCLUDED.service_type,
  customer_section_id = EXCLUDED.customer_section_id,
  group_id = EXCLUDED.group_id,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  intake_unified_title = EXCLUDED.intake_unified_title,
  intake_unified_category = EXCLUDED.intake_unified_category,
  intake_unified_priority = EXCLUDED.intake_unified_priority,
  intake_unified_service_type = EXCLUDED.intake_unified_service_type,
  applicable_order_statuses = EXCLUDED.applicable_order_statuses;

-- ---------- (E) Title ↔ tag mapping -----------------------------------------------

WITH titlemap AS (
  SELECT
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_RIDE_CANCEL_FEE')   AS t_cancel,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_RIDE_SAFETY')       AS t_safety,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_RIDE_CAPTAIN')     AS t_captain,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_RIDE_REFUND')       AS t_refund,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_RIDE_REFUND_STATUS') AS t_refund_st,
    (SELECT id FROM public.ticket_titles WHERE title_code = 'CUST_RIDE_FARE')         AS t_fare
), tagmap AS (
  SELECT
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_RIDE_CANCEL')  AS g_cancel,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_RIDE_SAFETY')  AS g_safety,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_RIDE_CAPTAIN') AS g_captain,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_RIDE_REFUND')  AS g_refund,
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'CUST_RIDE_FARE')    AS g_fare
)
INSERT INTO public.ticket_title_tags (ticket_title_id, tag_id)
SELECT t, g FROM (
  SELECT (SELECT t_cancel FROM titlemap),     (SELECT g_cancel FROM tagmap)
  UNION ALL SELECT (SELECT t_safety FROM titlemap),   (SELECT g_safety FROM tagmap)
  UNION ALL SELECT (SELECT t_captain FROM titlemap), (SELECT g_captain FROM tagmap)
  UNION ALL SELECT (SELECT t_refund FROM titlemap),   (SELECT g_refund FROM tagmap)
  UNION ALL SELECT (SELECT t_refund_st FROM titlemap), (SELECT g_refund FROM tagmap)
  UNION ALL SELECT (SELECT t_fare FROM titlemap),     (SELECT g_fare FROM tagmap)
) pairs(t, g)
WHERE t IS NOT NULL AND g IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
