-- Super Admin → App images: remote in-app app icon slots (Customer / Rider / Merchant).

INSERT INTO public.app_static_assets (id, app, section, label, description, r2_key, proxy_url, sort_order)
VALUES
  (
    'customer.brand.app_icon',
    'customer',
    'Branding',
    'App icon',
    'In-app bootstrap / brand mark. Updates on next app open. Phone home-screen icon still needs a store rebuild.',
    NULL,
    NULL,
    10
  ),
  (
    'rider.brand.app_icon',
    'rider',
    'Branding',
    'App icon',
    'In-app brand mark / splash icon. Updates on next app open. Phone home-screen icon still needs a store rebuild.',
    NULL,
    NULL,
    10
  ),
  (
    'merchant.brand.app_icon',
    'merchant',
    'Branding',
    'App icon',
    'In-app brand mark (login / header). Updates on next app open. Phone home-screen icon still needs a store rebuild.',
    NULL,
    NULL,
    10
  )
ON CONFLICT (id) DO UPDATE SET
  section = EXCLUDED.section,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
