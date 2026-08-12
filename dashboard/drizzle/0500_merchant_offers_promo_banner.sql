-- Merchant app: Offers & Promotions hero banner (super-admin upload → in-app promo card).
INSERT INTO public.app_static_assets (id, app, section, label, description, r2_key, proxy_url, sort_order)
VALUES (
  'merchant.offers.promo_banner',
  'merchant',
  'Offers',
  'Promo offer banner',
  'Hero image on Offers & Promotions → Create offers (GatiMitra Promos card).',
  NULL,
  NULL,
  10
)
ON CONFLICT (id) DO UPDATE SET
  section = EXCLUDED.section,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;
