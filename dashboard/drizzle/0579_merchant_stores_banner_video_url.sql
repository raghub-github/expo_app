-- Optional admin-uploaded hero video for store inner page (banner_url kept as fallback/poster).
ALTER TABLE merchant_stores ADD COLUMN IF NOT EXISTS banner_video_url TEXT;
