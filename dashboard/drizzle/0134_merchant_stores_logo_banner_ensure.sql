-- Ensure merchant_stores has banner_url for dashboard APIs (logo_url removed from product).
ALTER TABLE merchant_stores ADD COLUMN IF NOT EXISTS banner_url TEXT;
