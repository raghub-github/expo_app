-- Legacy seed rows (SEED_TICKETS_30_40) had no merchant_section_id, so they were omitted from
-- GET /merchant-partner/merchant-help-sections. Give them stable section keys so every catalog
-- row can appear in the merchant app (and duplicate section codes stay disambiguated via ticket_title_id).
--
-- Ensures icon column exists if migration 0198 was not applied yet.

ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS merchant_help_icon_name text;

UPDATE public.ticket_titles
SET
  merchant_section_id = 'payout_delayed',
  subtext = COALESCE(NULLIF(TRIM(subtext), ''), 'Settlement or payout delayed'),
  default_quick_options = COALESCE(
    default_quick_options,
    ARRAY['Payout not received yet', 'Settlement delayed', 'Wrong payout amount', 'Other']::text[]
  ),
  tag_id = COALESCE(tag_id, (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1)),
  priority_id = COALESCE(priority_id, (SELECT id FROM public.ticket_priorities WHERE priority_code = 'urgent' LIMIT 1)),
  intake_unified_title = COALESCE(NULLIF(TRIM(intake_unified_title), ''), 'PAYOUT_DELAYED'),
  intake_unified_category = COALESCE(NULLIF(TRIM(intake_unified_category), ''), 'EARNINGS'),
  intake_unified_priority = COALESCE(NULLIF(TRIM(intake_unified_priority), ''), 'URGENT'),
  intake_unified_service_type = COALESCE(NULLIF(TRIM(intake_unified_service_type), ''), 'GENERAL'),
  intake_ticket_type = COALESCE(NULLIF(TRIM(intake_ticket_type), ''), 'non_order'),
  merchant_help_icon_name = COALESCE(merchant_help_icon_name, 'time-outline')
WHERE title_code = 'MERCHANT_PAYOUT_DELAYED';

UPDATE public.ticket_titles
SET
  merchant_section_id = 'order_timing',
  subtext = COALESCE(NULLIF(TRIM(subtext), ''), 'Food order not picked or delayed'),
  default_quick_options = COALESCE(
    default_quick_options,
    ARRAY['Order not picked by rider', 'Order delayed', 'Wrong order received', 'Other']::text[]
  ),
  tag_id = COALESCE(tag_id, (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1)),
  priority_id = COALESCE(priority_id, (SELECT id FROM public.ticket_priorities WHERE priority_code = 'high' LIMIT 1)),
  intake_unified_title = COALESCE(NULLIF(TRIM(intake_unified_title), ''), 'ORDER_DELAYED'),
  intake_unified_category = COALESCE(NULLIF(TRIM(intake_unified_category), ''), 'DELIVERY'),
  intake_unified_priority = COALESCE(NULLIF(TRIM(intake_unified_priority), ''), 'HIGH'),
  intake_unified_service_type = COALESCE(NULLIF(TRIM(intake_unified_service_type), ''), 'FOOD'),
  intake_ticket_type = COALESCE(NULLIF(TRIM(intake_ticket_type), ''), 'non_order'),
  merchant_help_icon_name = COALESCE(merchant_help_icon_name, 'timer-outline')
WHERE title_code = 'MERCHANT_ORDER_DELAYED';
