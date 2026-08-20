ALTER TABLE public.cxapp_state_food_home_layout
  DROP COLUMN IF EXISTS discovery_deals_at_max_price,
  DROP COLUMN IF EXISTS discovery_deals_at_image_url,
  DROP COLUMN IF EXISTS discovery_crazy_deals_image_url,
  DROP COLUMN IF EXISTS discovery_free_packaging_image_url,
  DROP COLUMN IF EXISTS discovery_deals_at_label,
  DROP COLUMN IF EXISTS discovery_crazy_deals_label,
  DROP COLUMN IF EXISTS discovery_free_packaging_label;
