-- Ensure merchant_stores has banner_url (logo_url not used).
ALTER TABLE merchant_stores ADD COLUMN IF NOT EXISTS banner_url TEXT;
