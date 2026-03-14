-- Add close_reason to merchant_store_availability so the exact manual-close reason
-- can be stored and returned in store status API (e.g. "Going out for lunch").
ALTER TABLE merchant_store_availability
ADD COLUMN IF NOT EXISTS close_reason TEXT NULL;
