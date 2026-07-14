-- Rollback 0408_offer_type_and_items_integrity.sql
-- Removes create_path stamps only. Does not restore pre-0408 conditions_mode values.

BEGIN;

UPDATE public.merchant_offers
SET offer_metadata = COALESCE(offer_metadata, '{}'::jsonb) - 'create_path'
WHERE offer_metadata ? 'create_path';

COMMIT;
