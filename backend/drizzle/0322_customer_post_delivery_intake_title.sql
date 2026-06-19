-- Map post-delivery chat quick options to valid unified ticket title codes.
-- Fixes ticket create when parent folder row lacks intake_unified_title.

BEGIN;

UPDATE public.ticket_titles
SET intake_unified_title = 'CUSTOMER_GENERAL_QUERY',
    intake_unified_category = COALESCE(intake_unified_category, 'ORDER'),
    intake_unified_priority = COALESCE(intake_unified_priority, 'MEDIUM'),
    intake_unified_service_type = COALESCE(intake_unified_service_type, 'FOOD')
WHERE title_code = 'CUSTOMER_POST_DELIVERY'
  AND (intake_unified_title IS NULL OR TRIM(intake_unified_title) = '');

COMMIT;
